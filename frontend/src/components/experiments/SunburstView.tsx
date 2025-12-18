/** Sunburst/Radial Tree View - D3.js circular visualization */
import { useEffect, useRef, useState } from 'react';
import { formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

// Tree-shake D3 imports - only import what we need
import { select } from 'd3-selection';
import { hierarchy, partition } from 'd3-hierarchy';
import { scaleOrdinal } from 'd3-scale';
import { schemeCategory10 } from 'd3-scale-chromatic';
import { arc } from 'd3-shape';

interface SunburstViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

export const SunburstView = ({ files, childrenMap, onFileClick }: SunburstViewProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [warning, setWarning] = useState<string | null>(null);
  
  useEffect(() => {
    const svgNode = svgRef.current;  // Copy ref for cleanup
    if (!svgNode || files.length === 0) {
      setWarning(null);
      return;
    }
    
    setWarning(null); // Reset warning
    
    try {
      const svg = select(svgNode);
      svg.selectAll('*').remove();
      
      const width = svgNode.clientWidth;
      const height = svgNode.clientHeight;
      const radius = Math.min(width, height) / 2;
      
      if (width === 0 || height === 0) return; // Guard against zero dimensions
      
      // Build hierarchy with cycle detection and depth limiting
      const rootFiles = files.filter((f) => f.parents.length === 0);
      if (rootFiles.length === 0) return;
      
      // Cycle detection is done via path tracking
      const MAX_DEPTH = 10; // Limit recursion depth
      const MAX_NODES = 5000; // Limit total nodes to prevent browser crash
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
        
        // Limit total nodes to prevent browser crash
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
        
        const size = file.calculatedSize || file.size || 1; // Minimum 1 for visibility
        
        return {
          name: file.name,
          value: size,
          file,
          id: file.id,
          children: childNodes.length > 0 ? childNodes : undefined,
        };
      };
      
      const rootData = {
        name: 'root',
        children: rootFiles
          .slice(0, 50) // Limit to top 50 root folders to prevent overload
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
      
      // Limit descendants to prevent rendering too many elements
      const allDescendants = root.descendants();
      if (allDescendants.length > MAX_NODES) {
        // Only show top-level nodes if too many
        const limitedDescendants = allDescendants.filter((d: any) => d.depth <= 2);
        if (limitedDescendants.length === 0) {
          svg.append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', '#666')
            .text('Too many files to display. Try a different view.');
          return;
        }
      }
      
      // Create partition layout
      const partitionLayout = partition().size([2 * Math.PI, radius]);
      partitionLayout(root);
      
      // Color scale
      const color = scaleOrdinal(schemeCategory10);
      
      // Create arc generator
      const arcGen = arc()
        .startAngle((d: any) => d.x0)
        .endAngle((d: any) => d.x1)
        .innerRadius((d: any) => d.y0)
        .outerRadius((d: any) => d.y1);
      
      // Draw arcs - limit to visible nodes
      const g = svg
        .append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);
      
      const descendants = root.descendants();
      const visibleDescendants = descendants.length > MAX_NODES 
        ? (() => {
            setWarning(`Showing top-level folders only (${descendants.length} total items would be too many)`);
            return descendants.filter((d: any) => d.depth <= 3);
          })()
        : (() => {
            setWarning(null);
            return descendants;
          })();
      
      g
        .selectAll('path')
        .data(visibleDescendants)
        .enter()
        .append('path')
        .attr('fill', (_d: any, i) => color(i.toString()))
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .attr('d', arcGen as any)
        .style('cursor', 'pointer')
        .on('click', (_event, d: any) => {
          if (onFileClick && d.data.file) {
            onFileClick(d.data.file);
          }
        })
        .on('mouseover', function (_event, d: any) {
          select(this).attr('opacity', 0.7);
          // Show tooltip
          const tooltip = svg.append('g').attr('class', 'tooltip');
          tooltip
            .append('text')
            .attr('x', width / 2)
            .attr('y', 20)
            .attr('text-anchor', 'middle')
            .attr('fill', '#000')
            .attr('font-size', '14px')
            .text(`${d.data.name} (${formatSize(d.value)})`);
        })
        .on('mouseout', function () {
          select(this).attr('opacity', 1);
          svg.select('.tooltip').remove();
        });
      
      // Add labels for large enough arcs (limit to prevent overload)
      const labelableNodes = visibleDescendants.filter((d: any) => (d.x1 - d.x0) > 0.1).slice(0, 200);
      g.selectAll('text')
        .data(labelableNodes)
        .enter()
        .append('text')
        .attr('transform', (d: any) => {
          const x = ((d.x0 + d.x1) / 2) * 180 / Math.PI;
          const y = -(d.y0 + d.y1) / 2;
          return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
        })
        .attr('dy', '0.35em')
        .attr('text-anchor', (d: any) => (d.x0 + d.x1) / 2 < Math.PI ? 'start' : 'end')
        .attr('font-size', '10px')
        .attr('fill', '#fff')
        .text((d: any) => {
          const name = d.data.name;
          return name.length > 15 ? name.substring(0, 12) + '...' : name;
        });
      
    } catch (error) {
      console.error('Error rendering Sunburst:', error);
      if (svgNode) {
        const svg = select(svgNode);
        svg.selectAll('*').remove();
        svg.append('text')
          .attr('x', svgNode.clientWidth / 2)
          .attr('y', svgNode.clientHeight / 2)
          .attr('text-anchor', 'middle')
          .attr('fill', '#f00')
          .text('Error rendering visualization. Try a different view.');
      }
    }
    
    // Cleanup function - use captured svgNode, not ref
    return () => {
      if (svgNode) {
        select(svgNode).selectAll('*').remove();
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
    <div className="w-full h-full flex flex-col">
      {warning && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800">
          ⚠️ {warning}
        </div>
      )}
      <svg ref={svgRef} className="w-full flex-1" />
    </div>
  );
};
