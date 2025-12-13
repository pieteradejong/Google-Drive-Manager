/** Treemap visualization component using D3 */
import { useEffect, useRef } from 'react';
import type { FileItem } from '../types/drive';

// Tree-shake D3 imports - only import what we need
import { select } from 'd3-selection';
import { hierarchy, treemap } from 'd3-hierarchy';
import { scaleOrdinal } from 'd3-scale';
import { schemeCategory10 } from 'd3-scale-chromatic';

interface TreemapViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

export const TreemapView = ({ files, childrenMap, onFileClick }: TreemapViewProps) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || files.length === 0) return;

    try {
      const svg = select(svgRef.current);
      svg.selectAll('*').remove();

      const width = svgRef.current.clientWidth;
      const height = svgRef.current.clientHeight;

      if (width === 0 || height === 0) return;

      // Build hierarchy with cycle detection and depth limiting
      const rootFiles = files.filter((f) => f.parents.length === 0);
      if (rootFiles.length === 0) return;

      const MAX_DEPTH = 10;
      const MAX_NODES = 5000;
      let nodeCount = 0;

      const buildHierarchy = (fileId: string, depth: number = 0, path: Set<string> = new Set()): any => {
        // Prevent infinite loops from circular references
        if (path.has(fileId)) {
          console.warn(`Circular reference detected for file ${fileId}`);
          return null;
        }

        // Limit recursion depth
        if (depth > MAX_DEPTH) {
          return null;
        }

        // Limit total nodes
        if (nodeCount >= MAX_NODES) {
          return null;
        }

        const file = files.find((f) => f.id === fileId);
        if (!file) return null;

        nodeCount++;
        const newPath = new Set(path);
        newPath.add(fileId);

        const children = childrenMap[fileId] || [];
        const childNodes = children
          .map((childId) => buildHierarchy(childId, depth + 1, newPath))
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
        children: rootFiles
          .slice(0, 50) // Limit to top 50 root folders
          .map((f) => buildHierarchy(f.id))
          .filter((n) => n !== null),
      };

      if (!rootData.children || rootData.children.length === 0) {
        svg.append('text')
          .attr('x', width / 2)
          .attr('y', height / 2)
          .attr('text-anchor', 'middle')
          .attr('fill', '#666')
          .text('No data to display');
        return;
      }

      const root = hierarchy(rootData as any).sum((d: any) => d.value || 0);
    
    // Create treemap layout
    const treemapLayout = treemap()
      .size([width, height])
      .padding(2)
      .round(true);
    
    treemapLayout(root);
    
    // Color scale
    const color = scaleOrdinal(schemeCategory10);

      // Limit leaves to prevent too many DOM elements
      const allLeaves = root.leaves();
      const visibleLeaves = allLeaves.length > MAX_NODES 
        ? allLeaves.slice(0, MAX_NODES)
        : allLeaves;

      // Draw rectangles
      const cells = svg
        .selectAll('g')
        .data(visibleLeaves)
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
        select(this).attr('opacity', 0.8);
      })
      .on('mouseout', function () {
        select(this).attr('opacity', 1);
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
    } catch (error) {
      console.error('Error rendering Treemap:', error);
      if (svgRef.current) {
        const svg = select(svgRef.current);
        svg.selectAll('*').remove();
        svg.append('text')
          .attr('x', svgRef.current.clientWidth / 2)
          .attr('y', svgRef.current.clientHeight / 2)
          .attr('text-anchor', 'middle')
          .attr('fill', '#f00')
          .text('Error rendering visualization. Try a different view.');
      }
    }
    
    // Cleanup function
    return () => {
      if (svgRef.current) {
        select(svgRef.current).selectAll('*').remove();
      }
    };
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

