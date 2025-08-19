import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

function BarChart({ data }) {
  const ref = useRef();

  useEffect(() => {
    if (!data || data.length === 0) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const width = 400;
    const height = 300;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };

    const x = d3.scaleBand()
      .domain(data.map(d => d.source))
      .range([margin.left, width - margin.right])
      .padding(0.1);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.total)]).nice()
      .range([height - margin.bottom, margin.top]);

    const xAxis = g => g
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickSizeOuter(0));

    const yAxis = g => g
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y));

    svg.append("g")
      .selectAll("rect")
      .data(data)
      .join("rect")
        .attr("x", d => x(d.source))
        .attr("y", d => y(d.total))
        .attr("height", d => y(0) - y(d.total))
        .attr("width", x.bandwidth())
        .attr("fill", "steelblue");

    svg.append("g").call(xAxis);
    svg.append("g").call(yAxis);

  }, [data]);

  return (
    <svg ref={ref} width={width} height={height}></svg>
  );
}

export default BarChart;
