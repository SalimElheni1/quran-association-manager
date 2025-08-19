import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

function PieChart({ data }) {
  const ref = useRef();

  useEffect(() => {
    if (!data || data.length === 0) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const width = 300;
    const height = 300;
    const margin = 10;
    const radius = Math.min(width, height) / 2 - margin;

    const g = svg.append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const pie = d3.pie().value(d => d.total);
    const data_ready = pie(data);

    const arc = d3.arc()
      .innerRadius(0)
      .outerRadius(radius);

    g.selectAll('path')
      .data(data_ready)
      .enter()
      .append('path')
      .attr('d', arc)
      .attr('fill', d => color(d.data.category))
      .attr("stroke", "white")
      .style("stroke-width", "2px");

    g.selectAll('text')
      .data(data_ready)
      .enter()
      .append('text')
      .text(d => d.data.category)
      .attr("transform", d => `translate(${arc.centroid(d)})`)
      .style("text-anchor", "middle")
      .style("font-size", 12)
      .attr('fill', 'white');

  }, [data]);

  return (
    <svg ref={ref} width={width} height={height}></svg>
  );
}

export default PieChart;
