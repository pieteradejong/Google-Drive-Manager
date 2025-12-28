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
}

export type ViewMode = 'list';





