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

/**
 * MonthlyFeesTrendChart — 12-month bar of collected fee payments.
 * Data: window.electronAPI.getPayments() → { amount, payment_date, ... }
 * Buckets payments by YYYY-MM across the last 12 calendar months.
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
          const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months.push({ key: monthKey(toLocalISODate(m)), label: MONTHS[m.getMonth()] });
        }

        const payments = await window.electronAPI.getPayments();
        const byMonth = new Map(months.map((m) => [m.key, 0]));
        (payments || []).forEach((p) => {
          if (p && p.payment_date) {
            const key = p.payment_date.slice(0, 7);
            if (byMonth.has(key)) byMonth.set(key, byMonth.get(key) + (p.amount || 0));
          }
        });
        if (!cancelled) {
          setData({ months: months.map((m) => ({ ...m, total: byMonth.get(m.key) || 0 })) });
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

    const width = 520;
    const height = 220;
    const margin = { top: 12, right: 10, bottom: 30, left: 34 };
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
              {i % 2 === 0 ? months[i].label : ''}
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
      footer={<span className="text-muted">مجموع الرسوم المحصّلة شهرياً حسب تاريخ الدفع</span>}
    >
      {chart}
    </ChartCard>
  );
}

export default MonthlyFeesTrendChart;
