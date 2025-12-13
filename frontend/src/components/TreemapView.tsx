/** Treemap visualization component using D3 */
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { FileItem } from '../types/drive';

interface TreemapViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

export const TreemapView = ({ files, childrenMap, onFileClick }: TreemapViewProps) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || files.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Build hierarchy
    const rootFiles = files.filter((f) => f.parents.length === 0);
    if (rootFiles.length === 0) return;

    // Create hierarchy data structure
    const buildHierarchy = (fileId: string): any => {
      const file = files.find((f) => f.id === fileId);
      if (!file) return null;

      const children = childrenMap[fileId] || [];
      const childNodes = children
        .map((childId) => buildHierarchy(childId))
        .filter((node) => node !== null);

      const size = file.calculatedSize || file.size || 0;

      return {
        name: file.name,
        value: size,
        file,
        children: childNodes.length > 0 ? childNodes : undefined,
      };
    };

    const rootData = {
      name: 'root',
      children: rootFiles.map((f) => buildHierarchy(f.id)).filter((n) => n !== null),
    };

    const root = d3.hierarchy(rootData as any).sum((d: any) => d.value || 0);

    // Create treemap layout
    const treemap = d3
      .treemap()
      .size([width, height])
      .padding(2)
      .round(true);

    treemap(root);

    // Color scale
    const color = d3.scaleOrdinal(d3.schemeCategory10);

    // Draw rectangles
    const cells = svg
      .selectAll('g')
      .data(root.leaves())
      .enter()
      .append('g')
      .attr('transform', (d: any) => `translate(${d.x0},${d.y0})`);

    cells
      .append('rect')
      .attr('width', (d: any) => d.x1 - d.x0)
      .attr('height', (d: any) => d.y1 - d.y0)
      .attr('fill', (_d: any, i) => color(i.toString()))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('click', (_event, d: any) => {
        if (onFileClick && d.data.file) {
          onFileClick(d.data.file);
        }
      })
      .on('mouseover', function () {
        d3.select(this).attr('opacity', 0.8);
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 1);
      });

    // Add labels
    cells
      .append('text')
      .attr('x', (d: any) => (d.x1 - d.x0) / 2)
      .attr('y', (d: any) => (d.y1 - d.y0) / 2)
      .attr('dy', '.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', (d: any) => {
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        return Math.min(width, height) > 50 ? '12px' : '10px';
      })
      .attr('fill', '#fff')
      .text((d: any) => {
        const width = d.x1 - d.x0;
        const height = d.y1 - d.y0;
        if (width < 60 || height < 20) return '';
        return d.data.name.length > 20 ? d.data.name.substring(0, 17) + '...' : d.data.name;
      });
  }, [files, childrenMap, onFileClick]);

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No files to display
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};

