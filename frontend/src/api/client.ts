/** API client configuration */
import axios from 'axios';
import type { 
  ScanResponse, 
  HealthResponse, 
  QuickScanResponse,
  FullScanStatusResponse 
} from '../types/drive';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  /** Health check endpoint */
  health: async (): Promise<HealthResponse> => {
    const response = await apiClient.get<HealthResponse>('/api/health');
    return response.data;
  },

  /** Quick scan - returns overview and top-level folders only */
  quickScan: async (): Promise<QuickScanResponse> => {
    const response = await apiClient.get<QuickScanResponse>('/api/scan/quick');
    return response.data;
  },

  /** Start full background scan */
  startFullScan: async (): Promise<{ scan_id: string }> => {
    const response = await apiClient.post<{ scan_id: string }>('/api/scan/full/start');
    return response.data;
  },

  /** Get full scan status and progress */
  getFullScanStatus: async (scanId: string): Promise<FullScanStatusResponse> => {
    const response = await apiClient.get<FullScanStatusResponse>(`/api/scan/full/status/${scanId}`);
    return response.data;
  },

  /** Legacy: Full scan (blocking) - kept for backward compatibility */
  scan: async (): Promise<ScanResponse> => {
    const response = await apiClient.get<ScanResponse>('/api/scan');
    return response.data;
  },

  /** Invalidate cache */
  invalidateCache: async (scanType?: 'quick_scan' | 'full_scan'): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>('/api/cache', {
      params: scanType ? { scan_type: scanType } : undefined
    });
    return response.data;
  },
};

export default apiClient;





