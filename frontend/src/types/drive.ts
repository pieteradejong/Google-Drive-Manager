/** Type definitions for Google Drive data structures */

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

export type ViewMode = 'list';





