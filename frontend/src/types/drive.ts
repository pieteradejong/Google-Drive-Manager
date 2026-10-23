/** Type definitions for Google Drive data structures */

/** Shortcut details for files that are shortcuts to other files/folders */
export interface ShortcutDetails {
  targetId: string;
  targetMimeType?: string;
}

export interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  calculatedSize?: number;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents: string[];
  // New fields for duplicate detection
  md5Checksum?: string;  // 32-char hex hash, only for binary files
  shortcutDetails?: ShortcutDetails;  // Only for shortcuts
  ownedByMe?: boolean;
  path?: string;  // Computed path from root (e.g., "/Folder/Subfolder")
  parentFolderId?: string;  // First parent folder ID for navigation
}

/** Duplicate group with confidence level */
export interface DuplicateGroup {
  name: string;
  size: number;
  file_ids: string[];
  count: number;
  potential_savings: number;
  confidence: 'verified' | 'potential';
  checksum?: string;  // Only for verified groups (md5Checksum)
  mimeType?: string;
}

/** Response from /api/analytics/view/duplicates */
export interface DuplicatesAnalyticsResponse {
  total_groups: number;
  total_verified_groups: number;
  total_potential_groups: number;
  offset: number;
  limit: number;
  total_verified_savings: number;
  total_potential_savings: number;
  total_savings: number;
  verified_groups: DuplicateGroup[];
  potential_groups: DuplicateGroup[];
  groups: DuplicateGroup[];  // Legacy: combined groups
  files: FileItem[];  // Enriched with path and parentFolderId
}

export interface DriveStats {
  total_files: number;
  total_size: number;
  folder_count: number;
  file_count: number;
}

export interface ScanResponse {
  files: FileItem[];
  children_map: Record<string, string[]>;
  stats: DriveStats;
}

export interface HealthResponse {
  status: string;
}

export interface DriveOverview {
  total_quota?: string;
  used?: string;
  used_in_drive?: string;
  user_email?: string;
  user_display_name?: string;
}

export interface QuickScanResponse {
  overview: DriveOverview;
  top_folders: FileItem[];
  estimated_total_files?: number;
}

export interface ScanProgress {
  scan_id: string;
  stage: 'fetching' | 'building_tree' | 'calculating_sizes' | 'complete' | 'error' | 'starting';
  progress: number;
  current_page?: number;
  estimated_pages?: number;
  files_fetched?: number;
  message?: string;
}

export interface FullScanStatusResponse {
  scan_id: string;
  status: 'starting' | 'running' | 'complete' | 'error';
  progress: ScanProgress;
  result?: ScanResponse;
}

export interface FullScanCacheStatusResponse {
  exists: boolean;
  valid: boolean;
  timestamp?: string;
  file_count?: number;
  total_size?: number;
  cache_version?: number;
  reason?: string;
  age_seconds?: number;  // Age of cache in seconds
  is_stale?: boolean;  // True if cache is older than 7 days
}

export type ViewMode = 'list';

// =============================================================================
// DAG Types (from backend /api/dag endpoints)
// =============================================================================

/** Information about a single DAG node from backend */
export interface DagNodeInfo {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  ownedByMe: boolean;
  depth: number;
  parents: string[];
  children: string[];
  size?: number;
}

/** Warnings generated during DAG computation */
export interface DagWarnings {
  missingParentRefs: number;
  duplicateEdges: number;
  cycleDetected: boolean;
  cycleNodeCount: number;
  notes: string[];
}

/** Ownership statistics for the DAG */
export interface DagOwnershipStats {
  ownedCount: number;
  sharedCount: number;
  ownedSizeBytes: number;
  sharedSizeBytes: number;
}

/** Metadata about the computed DAG */
export interface DagMeta {
  computed_at: string;
  node_count: number;
  edge_count: number;
  root_count: number;
}

/** Edge in the DAG from parent to child */
export interface DagEdge {
  from: string;
  to: string;
}

/** Full DAG response from /api/dag */
export interface DagResponse {
  nodes: DagNodeInfo[];
  edges: DagEdge[];
  roots: string[];
  topoOrder: string[];
  maxDepth: number;
  warnings: DagWarnings;
  ownershipStats: DagOwnershipStats;
  meta: DagMeta;
}

/** DAG status response from /api/dag/status */
export interface DagStatusResponse {
  exists: boolean;
  computed_at?: string;
  node_count?: number;
  edge_count?: number;
  root_count?: number;
  max_depth?: number;
  is_stale: boolean;
}

/** Single node response from /api/dag/node/{id} */
export interface DagNodeResponse extends DagNodeInfo {
  isRoot: boolean;
  childrenCount: number;
  topoOrder?: number;
}





