import type { DriveDag } from '../../../utils/driveDag';
import type { FileItem } from '../../../types/drive';

export type DagTabId =
  | 'tree'
  | 'layered'
  | 'ego'
  | 'paths'
  | 'hubs'
  | 'folderOnly'
  | 'matrix'
  | 'sankey'
  | 'orphans';

export interface DagFilters {
  foldersOnly: boolean;
  minSizeBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxEdges: number;
  maxChildrenPerNode: number;
  hops: number;
  maxPaths: number;
}

export interface DagTabProps {
  dag: DriveDag;
  files: FileItem[];
  fileById: Map<string, FileItem>;
  selectedNodeId: string;
  setSelectedNodeId: (id: string) => void;
  selectedRootIds: string[];
  setSelectedRootIds: (ids: string[]) => void;
  filters: DagFilters;
  setFilters: (next: DagFilters) => void;
  onFileClick?: (file: FileItem) => void;
}
