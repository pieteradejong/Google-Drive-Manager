/** Folder Tree View - Visualize folder hierarchy with depth coloring */
import { useEffect, useRef, useState, useMemo } from 'react';
import { select } from 'd3-selection';
import { hierarchy, tree } from 'd3-hierarchy';
import { zoom, zoomIdentity } from 'd3-zoom';
import { formatSize } from '../../utils/navigation';
import { measureSync } from '../../utils/performance';
import { LoadingState } from '../LoadingState';
import type { FileItem } from '../../types/drive';

interface FolderTreeViewProps {
  files: FileItem[];
  childrenMap: Record<string, string[]>;
  onFileClick?: (file: FileItem) => void;
}

interface TreeNode {
  id: string;
  name: string;
  size: number;
  depth: number;
  file: FileItem;
  children?: TreeNode[];
}

export const FolderTreeView = ({ files, childrenMap, onFileClick }: FolderTreeViewProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxDepth, setMaxDepth] = useState<number>(5);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [isBuilding, setIsBuilding] = useState(true);
  const [buildProgress, setBuildProgress] = useState(0);
  
  // Calculate depth for each folder
  const folderDepths = useMemo(() => {
    const depths = new Map<string, number>();
    const visited = new Set<string>();
    
    const calculateDepth = (folderId: string, currentDepth: number = 0): number => {
      if (visited.has(folderId)) {
        return depths.get(folderId) || currentDepth;
      }
      visited.add(folderId);
      
      const folder = files.find(f => f.id === folderId);
      if (!folder || folder.mimeType !== 'application/vnd.google-apps.folder') {
        return currentDepth;
      }
      
      if (folder.parents.length === 0) {
        depths.set(folderId, 0);
        return 0;
      }
      
      let maxParentDepth = 0;
      for (const parentId of folder.parents) {
        if (!depths.has(parentId)) {
          calculateDepth(parentId, currentDepth - 1);
        }
        maxParentDepth = Math.max(maxParentDepth, depths.get(parentId) || 0);
      }
      
      const depth = maxParentDepth + 1;
      depths.set(folderId, depth);
      return depth;
    };
    
    files.forEach(file => {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        calculateDepth(file.id);
      }
    });
    
    return depths;
  }, [files]);
  
  // Build tree structure
  const treeData = useMemo(() => {
    setIsBuilding(true);
    setBuildProgress(0);
    
    // Simulate progress
    const progressInterval = setInterval(() => {
      setBuildProgress(prev => Math.min(prev + 15, 85));
    }, 150);
    
    const result = measureSync('FolderTreeView: buildTreeData', () => {
      const fileMap = new Map(files.map(f => [f.id, f]));
      const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
      
      // Find root folders (no parents or parents not in files)
      const rootFolders = folders.filter(f => 
        f.parents.length === 0 || !f.parents.some(p => fileMap.has(p))
      );
      
      const buildNode = (folder: FileItem, depth: number = 0): TreeNode | null => {
        if (depth > maxDepth) return null;
        
        const nodeDepth = folderDepths.get(folder.id) || 0;
        const children = (childrenMap[folder.id] || [])
          .map(id => fileMap.get(id))
          .filter((f): f is FileItem => f !== undefined && f.mimeType === 'application/vnd.google-apps.folder')
          .slice(0, 20); // Limit children for performance
        
        const node: TreeNode = {
          id: folder.id,
          name: folder.name,
          size: folder.calculatedSize || folder.size || 0,
          depth: nodeDepth,
          file: folder,
          children: children.length > 0 
            ? children.map(child => buildNode(child, depth + 1)).filter((n): n is TreeNode => n !== null)
            : undefined
        };
        
        return node;
      };
      
      // For now, show first root folder as the tree (or combine if multiple)
      if (rootFolders.length === 0) return null;
      
      // Create a virtual root if multiple roots
      if (rootFolders.length > 1) {
        return {
          id: 'root',
          name: 'Root',
          size: rootFolders.reduce((sum, f) => sum + (f.calculatedSize || f.size || 0), 0),
          depth: -1,
          file: { id: 'root', name: 'Root', mimeType: 'application/vnd.google-apps.folder', parents: [], size: 0 } as FileItem,
          children: rootFolders.slice(0, 10).map(f => buildNode(f)).filter((n): n is TreeNode => n !== null)
        };
      }
      
      return buildNode(rootFolders[0]);
    }, 500); // Warn if >500ms
    
    clearInterval(progressInterval);
    setBuildProgress(100);
    
    setTimeout(() => {
      setIsBuilding(false);
    }, 200);
    
    return result;
  }, [files, childrenMap, folderDepths, maxDepth]);
  
  // Show loading state while building
  if (isBuilding || !treeData) {
    return (
      <LoadingState
        operation="Building folder tree"
        details={`Processing ${files.length} files...`}
        progress={buildProgress}
      />
    );
  }
  
  // Color scale based on depth
  const getColor = (depth: number): string => {
    const colors = [
      '#3b82f6', // Blue (depth 0)
      '#10b981', // Green (depth 1)
      '#f59e0b', // Yellow (depth 2)
      '#ef4444', // Red (depth 3+)
      '#8b5cf6', // Purple (depth 4+)
      '#ec4899'  // Pink (depth 5+)
    ];
    return colors[Math.min(depth, colors.length - 1)];
  };
  
  // Calculate max size for scaling
  const maxSize = useMemo(() => {
    return measureSync('FolderTreeView: calculateMaxSize', () => {
      if (!treeData) return 1;
      const allNodes: TreeNode[] = [];
      const traverse = (node: TreeNode) => {
        allNodes.push(node);
        node.children?.forEach(traverse);
      };
      traverse(treeData);
      return Math.max(...allNodes.map(n => n.size), 1);
    }, 200);
  }, [treeData]);
  
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !treeData) return;
    
    const svg = select(svgRef.current);
    svg.selectAll('*').remove();
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    const margin = { top: 40, right: 40, bottom: 40, left: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create container group for zoom/pan
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Create D3 hierarchy
    const root = hierarchy(treeData, d => d.children);
    
    // Create tree layout
    const treeLayout = tree<TreeNode>()
      .nodeSize([80, orientation === 'vertical' ? 200 : 150])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.2));
    
    treeLayout(root);
    
    // Calculate bounds
    const nodes = root.descendants();
    const links = root.links();
    
    // Adjust for orientation
    let xOffset = 0;
    let yOffset = 0;
    
    if (orientation === 'vertical') {
      // Vertical: y is depth, x is horizontal position
      xOffset = -Math.min(...nodes.map(d => (d as any).x || 0));
      yOffset = 20;
    } else {
      // Horizontal: x is depth, y is vertical position
      xOffset = 20;
      yOffset = -Math.min(...nodes.map(d => (d as any).y || 0));
    }
    
    // Draw links
    const linkGroup = g.append('g').attr('class', 'links');
    linkGroup.selectAll('path')
      .data(links)
      .enter()
      .append('path')
      .attr('d', d => {
        const source = d.source as any;
        const target = d.target as any;
        
        if (orientation === 'vertical') {
          return `M${source.x + xOffset},${source.y + yOffset}L${target.x + xOffset},${target.y + yOffset}`;
        } else {
          return `M${source.y + xOffset},${source.x + yOffset}L${target.y + xOffset},${target.x + yOffset}`;
        }
      })
      .attr('fill', 'none')
      .attr('stroke', '#ccc')
      .attr('stroke-width', 1.5);
    
    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const nodesSelection = nodeGroup.selectAll('g.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => {
        const x = (d as any).x || 0;
        const y = (d as any).y || 0;
        if (orientation === 'vertical') {
          return `translate(${x + xOffset},${y + yOffset})`;
        } else {
          return `translate(${y + xOffset},${x + yOffset})`;
        }
      })
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        const node = d.data as TreeNode;
        if (node.id !== 'root') {
          onFileClick?.(node.file);
        }
      });
    
    // Draw circles for nodes
    nodesSelection.append('circle')
      .attr('r', d => {
        const node = d.data as TreeNode;
        const size = node.size || 1;
        const radius = Math.sqrt(size / maxSize) * 20 + 5;
        return Math.max(radius, 5);
      })
      .attr('fill', d => {
        const node = d.data as TreeNode;
        return getColor(node.depth);
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);
    
    // Draw labels
    nodesSelection.append('text')
      .attr('dy', d => {
        const node = d.data as TreeNode;
        const size = node.size || 1;
        const radius = Math.sqrt(size / maxSize) * 20 + 5;
        return radius + 15;
      })
      .attr('x', 0)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#333')
      .text(d => {
        const node = d.data as TreeNode;
        const name = node.name.length > 15 ? node.name.substring(0, 15) + '...' : node.name;
        return name;
      });
    
    // Add tooltips
    nodesSelection.append('title')
      .text(d => {
        const node = d.data as TreeNode;
        return `${node.name}\n${formatSize(node.size)}\nDepth: ${node.depth}`;
      });
    
    // Setup zoom
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        const transform = event.transform;
        g.attr('transform', `translate(${margin.left + transform.x},${margin.top + transform.y}) scale(${transform.k})`);
      });
    
    svg.call(zoomBehavior as any);
    
    // Center the view
    const bounds = (g.node() as any)?.getBBox();
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      const fullWidth = bounds.width;
      const fullHeight = bounds.height;
      const midX = bounds.x + fullWidth / 2;
      const midY = bounds.y + fullHeight / 2;
      
      const scale = Math.min(innerWidth / fullWidth, innerHeight / fullHeight, 1) * 0.8;
      const translateX = (innerWidth / 2 - midX * scale);
      const translateY = (innerHeight / 2 - midY * scale);
      
      svg.call(
        zoomBehavior.transform as any,
        zoomIdentity.translate(translateX, translateY).scale(scale)
      );
    }
    
    // Cleanup
    return () => {
      svg.on('.zoom', null);
    };
  }, [treeData, orientation, maxSize, maxDepth, onFileClick]);
  
  if (!treeData) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center text-gray-500">
          <p className="text-lg font-medium mb-2">No folders to display</p>
          <p className="text-sm">Run a full scan to see folder structure</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Controls */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Max Depth:</label>
            <input
              type="number"
              min="1"
              max="10"
              value={maxDepth}
              onChange={(e) => setMaxDepth(parseInt(e.target.value) || 5)}
              className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Orientation:</label>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as 'vertical' | 'horizontal')}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </div>
        </div>
        <div className="text-sm text-gray-600">
          Click nodes to navigate • Scroll to zoom • Drag to pan
        </div>
      </div>
      
      {/* Tree Visualization */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        <svg ref={svgRef} className="w-full h-full" />
      </div>
      
      {/* Legend */}
      <div className="bg-white border-t border-gray-200 px-4 py-2">
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-600 font-medium">Depth:</span>
          {[0, 1, 2, 3, 4, 5].map(depth => (
            <div key={depth} className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded-full border border-gray-300"
                style={{ backgroundColor: getColor(depth) }}
              />
              <span className="text-gray-600">Level {depth}</span>
            </div>
          ))}
          <span className="text-gray-400 ml-4">Node size = folder size</span>
        </div>
      </div>
    </div>
  );
};
