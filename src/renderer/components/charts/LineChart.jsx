import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

function LineChart({ data }) {
  const ref = useRef();

  useEffect(() => {
    if (!data || data.length === 0) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove(); // Clear previous chart

    const width = 500;
    const height = 300;
    const margin = { top: 20, right: 30, bottom: 40, left: 50 };

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => new Date(d.month)))
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => Math.max(d.totalIncome, d.totalExpense))]).nice()
      .range([height - margin.bottom, margin.top]);

    const xAxis = g => g
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0));

    const yAxis = g => g
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(height / 40));

    svg.append("g").call(xAxis);
    svg.append("g").call(yAxis);

    const incomeLine = d3.line()
      .x(d => x(new Date(d.month)))
      .y(d => y(d.totalIncome));

    const expenseLine = d3.line()
      .x(d => x(new Date(d.month)))
      .y(d => y(d.totalExpense));

    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-width", 1.5)
      .attr("d", incomeLine);

    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "red")
      .attr("stroke-width", 1.5)
      .attr("d", expenseLine);

  }, [data]);

  return (
    <svg ref={ref} width={500} height={300}></svg>
  );
}

export default LineChart;
