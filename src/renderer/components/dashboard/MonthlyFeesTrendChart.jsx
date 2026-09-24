import React, { useEffect, useMemo, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { max } from 'd3-array';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { PERMISSIONS } from '@renderer/utils/permissions';
import ChartCard from '@renderer/components/dashboard/ChartCard';
import { getAcademicYearString } from '@renderer/utils/academicYear';
import { toLocalISODate } from '@renderer/utils/dates';
import { error as logError } from '@renderer/utils/logger';

const MONTHS = [
  'جانفي',
  'فيفري',
  'مارس',
  'أفريل',
  'ماي',
  'جوان',
  'جويلية',
  'أوت',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const monthKey = (d) => d.slice(0, 7); // 'YYYY-MM'

// Fee payments are recorded as income under this category; refunds add an expense under the other.
const FEES_CATEGORY = 'رسوم الطلاب';
const FEE_REFUNDS_CATEGORY = 'استرجاع رسوم';

const categoryTotal = (rows, category) =>
  (rows || []).filter((r) => r.category === category).reduce((sum, r) => sum + (r.total || 0), 0);

/**
 * MonthlyFeesTrendChart — 12-month bar of net student fees collected
 * (fee income minus fee refunds), one financial summary per calendar month.
 */
function MonthlyFeesTrendChart() {
  const { hasPermission } = usePermissions();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const canView = hasPermission(PERMISSIONS.FINANCIALS_VIEW);

  useEffect(() => {
    if (!canView) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const now = new Date();
        const months = [];
        for (let i = 11; i >= 0; i -= 1) {
          const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const last = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
          months.push({
            key: monthKey(toLocalISODate(first)),
            label: MONTHS[first.getMonth()],
            period: { startDate: toLocalISODate(first), endDate: toLocalISODate(last) },
          });
        }

        const summaries = await Promise.all(
          months.map((m) => window.electronAPI.getFinancialSummary(m.period)),
        );
        if (!cancelled) {
          setData({
            months: months.map(({ key, label }, i) => ({
              key,
              label,
              total:
                categoryTotal(summaries[i]?.incomeByCategory, FEES_CATEGORY) -
                categoryTotal(summaries[i]?.expensesByCategory, FEE_REFUNDS_CATEGORY),
            })),
          });
        }
      } catch (err) {
        logError('MonthlyFeesTrendChart failed:', err);
        if (!cancelled) setError(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [canView]);

  const chart = useMemo(() => {
    if (!data) return null;
    const months = data.months;
    const maxTotal = max(months, (d) => d.total) || 0;

    // Drawn close to its full-width rendered size so labels keep their natural size.
    const width = 960;
    const height = 260;
    const margin = { top: 12, right: 12, bottom: 30, left: 56 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const x = scaleBand()
      .domain(months.map((d) => d.key))
      .range([0, innerW])
      .padding(0.22);
    const y = scaleLinear()
      .domain([0, maxTotal || 1])
      .nice()
      .range([innerH, 0]);

    const barWidth = Math.max(2, x.bandwidth());

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="مخطط الإيرادات الشهرية لآخر ١٢ شهراً"
        className="ftn-chart-svg"
      >
        <g transform={`translate(${margin.left},${margin.top})`}>
          {y.ticks(4).map((tick) => (
            <line
              key={`g-${tick}`}
              x1={0}
              x2={innerW}
              y1={y(tick)}
              y2={y(tick)}
              className="ftn-chart-gridline"
            />
          ))}
          {y.ticks(4).map((tick) => (
            <text
              key={`yl-${tick}`}
              x={-8}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              className="ftn-chart-ylabel"
            >
              {tick.toLocaleString('ar-TN')}
            </text>
          ))}
          {months.map((d) => {
            const h = innerH - y(d.total);
            return (
              <rect
                key={d.key}
                x={x(d.key)}
                y={h >= 0 ? innerH - h : innerH}
                width={barWidth}
                height={Math.max(0, h)}
                rx={2}
                className="ftn-chart-bar"
              >
                <title>{`${d.label}: ${d.total} د.ت`}</title>
              </rect>
            );
          })}
          {months.map((_, i) => (
            <text
              key={`lbl-${months[i].key}`}
              x={x(months[i].key) + x.bandwidth() / 2}
              y={innerH + 16}
              textAnchor="middle"
              className="ftn-chart-xlabel"
            >
              {months[i].label}
            </text>
          ))}
        </g>
      </svg>
    );
  }, [data]);

  if (!canView) return null;

  return (
    <ChartCard
      title="الإيرادات الشهرية (آخر ١٢ شهراً)"
      subtitle={`السنة الدراسية ${getAcademicYearString()}`}
      loading={!data && !error}
      empty={!!error}
      footer={
        <span className="text-muted">
          صافي رسوم الطلاب المحصّلة شهرياً، بعد خصم المبالغ المسترجعة
        </span>
      }
    >
      {chart}
    </ChartCard>
  );
}

export default MonthlyFeesTrendChart;
