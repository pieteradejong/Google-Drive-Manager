/** Sankey/Flow Diagram View - D3.js flow visualization */
import { useEffect, useRef } from 'react';
import { formatSize } from '../../utils/navigation';
import type { FileItem } from '../../types/drive';

// Tree-shake D3 imports - only import what we need
import { select } from 'd3-selection';

interface SankeyViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

export const SankeyView = ({ files, childrenMap, onFileClick }: SankeyViewProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  
  useEffect(() => {
    const svgNode = svgRef.current;  // Copy ref for cleanup
    if (!svgNode || files.length === 0) return;
    
    try {
      const svg = select(svgNode);
      svg.selectAll('*').remove();
    
    const width = svgNode.clientWidth;
    const height = svgNode.clientHeight;
    
    // Simplified flow visualization - show root folders and their sizes
    const rootFolders = files.filter(
      (f) => f.parents.length === 0 && f.mimeType === 'application/vnd.google-apps.folder'
    );
    
    if (rootFolders.length === 0) {
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .text('No folders to display');
      return;
    }
    
    // Sort by size
    const sortedFolders = [...rootFolders].sort((a, b) => {
      const sizeA = a.calculatedSize || a.size || 0;
      const sizeB = b.calculatedSize || b.size || 0;
      return sizeB - sizeA;
    });
    
    // Take top 10 for readability
    const topFolders = sortedFolders.slice(0, 10);
    const maxSize = topFolders[0]?.calculatedSize || topFolders[0]?.size || 1;
    
    // Create nodes and links
    const nodes = [
      { id: 'root', name: 'Root', size: maxSize },
      ...topFolders.map((f) => ({
        id: f.id,
        name: f.name,
        size: f.calculatedSize || f.size || 0,
        file: f,
      })),
    ];
    
    const links = topFolders.map((f) => ({
      source: 'root',
      target: f.id,
      value: f.calculatedSize || f.size || 0,
    }));
    
    // Simple horizontal flow layout
    const nodeHeight = 40;
    const nodeSpacing = 10;
    const startX = 50;
    const endX = width - 200;
    
    // Position nodes
    nodes.forEach((node, i) => {
      if (node.id === 'root') {
        (node as any).x = startX;
        (node as any).y = height / 2;
        (node as any).width = 30;
        (node as any).height = nodeHeight;
      } else {
        (node as any).x = endX;
        (node as any).y = 50 + (i - 1) * (nodeHeight + nodeSpacing);
        (node as any).width = 150;
        (node as any).height = nodeHeight;
      }
    });
    
    // Draw links
    const linkGroup = svg.append('g').attr('class', 'links');
    linkGroup
      .selectAll('path')
      .data(links)
      .enter()
      .append('path')
      .attr('d', (d: any) => {
        const source = nodes.find((n) => n.id === d.source);
        const target = nodes.find((n) => n.id === d.target);
        if (!source || !target) return '';
        
        const sx = (source as any).x + (source as any).width;
        const sy = (source as any).y + (source as any).height / 2;
        const tx = (target as any).x;
        const ty = (target as any).y + (target as any).height / 2;
        
        return `M ${sx} ${sy} L ${tx} ${ty}`;
      })
      .attr('stroke', '#999')
      .attr('stroke-width', (d: any) => Math.max(1, (d.value / maxSize) * 10))
      .attr('fill', 'none')
      .attr('opacity', 0.6);
    
    // Draw nodes
    const nodeGroup = svg.append('g').attr('class', 'nodes');
    nodeGroup
      .selectAll('rect')
      .data(nodes)
      .enter()
      .append('rect')
      .attr('x', (d: any) => d.x)
      .attr('y', (d: any) => d.y)
      .attr('width', (d: any) => d.width)
      .attr('height', (d: any) => d.height)
      .attr('fill', (d: any) => (d.id === 'root' ? '#4A90E2' : '#7ED321'))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (_event, d: any) => {
        if (onFileClick && d.file) {
          onFileClick(d.file);
        }
      })
      .on('mouseover', function () {
        select(this).attr('opacity', 0.7);
      })
      .on('mouseout', function () {
        select(this).attr('opacity', 1);
      });
    
    // Add labels
    nodeGroup
      .selectAll('text')
      .data(nodes)
      .enter()
      .append('text')
      .attr('x', (d: any) => d.x + d.width / 2)
      .attr('y', (d: any) => d.y + d.height / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', '#fff')
      .attr('font-weight', 'bold')
      .text((d: any) => {
        if (d.id === 'root') return 'Root';
        const name = d.name;
        return name.length > 15 ? name.substring(0, 12) + '...' : name;
      });
    
    // Add size labels
    nodeGroup
      .selectAll('.size-label')
      .data(nodes.filter((n) => n.id !== 'root'))
      .enter()
      .append('text')
      .attr('class', 'size-label')
      .attr('x', (d: any) => d.x + d.width + 5)
      .attr('y', (d: any) => d.y + d.height / 2)
      .attr('dy', '0.35em')
      .attr('font-size', '10px')
      .attr('fill', '#666')
      .text((d: any) => formatSize(d.size));
    } catch (error) {
      console.error('Error rendering Sankey:', error);
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
    <div className="w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};
