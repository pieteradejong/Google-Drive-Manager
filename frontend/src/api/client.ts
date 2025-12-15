/** API client configuration */
import axios from 'axios';
import type { 
  ScanResponse, 
  HealthResponse, 
  QuickScanResponse,
  FullScanStatusResponse 
} from '../types/drive';
import { measureAsync } from '../utils/performance';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for timing
apiClient.interceptors.request.use((config) => {
  // Store start time in config
  (config as any).__startTime = performance.now();
  return config;
});

// Add response interceptor for timing
apiClient.interceptors.response.use(
  (response) => {
    const startTime = (response.config as any).__startTime;
    if (startTime) {
      const duration = performance.now() - startTime;
      const method = response.config.method?.toUpperCase() || 'GET';
      const url = response.config.url || '';
      const operationName = `${method} ${url}`;

      // Log slow API calls
      if (duration > 2000) {
        console.error(
          `[Performance] API call ${operationName} took ${duration.toFixed(2)}ms (VERY SLOW)`
        );
      } else if (duration > 500) {
        console.warn(
          `[Performance] API call ${operationName} took ${duration.toFixed(2)}ms (SLOW)`
        );
      }
    }
    return response;
  },
  (error) => {
    const startTime = (error.config as any)?.__startTime;
    if (startTime) {
      const duration = performance.now() - startTime;
      const method = error.config?.method?.toUpperCase() || 'GET';
      const url = error.config?.url || '';
      console.error(
        `[Performance] API call ${method} ${url} failed after ${duration.toFixed(2)}ms`
      );
    }
    return Promise.reject(error);
  }
);

export const api = {
  /** Health check endpoint */
  health: async (): Promise<HealthResponse> => {
    const response = await apiClient.get<HealthResponse>('/api/health');
    return response.data;
  },

  /** Quick scan - returns overview and top-level folders only */
  quickScan: async (): Promise<QuickScanResponse> => {
    return measureAsync('API: quickScan', async () => {
      const response = await apiClient.get<QuickScanResponse>('/api/scan/quick');
      return response.data;
    });
  },

  /** Start full background scan */
  startFullScan: async (): Promise<{ scan_id: string }> => {
    return measureAsync('API: startFullScan', async () => {
      const response = await apiClient.post<{ scan_id: string }>('/api/scan/full/start');
      return response.data;
    });
  },

  /** Get full scan status and progress */
  getFullScanStatus: async (scanId: string): Promise<FullScanStatusResponse> => {
    return measureAsync('API: getFullScanStatus', async () => {
      const response = await apiClient.get<FullScanStatusResponse>(`/api/scan/full/status/${scanId}`);
      return response.data;
    }, 100); // Lower threshold for polling calls
  },

  /** Legacy: Full scan (blocking) - kept for backward compatibility */
  scan: async (): Promise<ScanResponse> => {
    return measureAsync('API: scan (blocking)', async () => {
      const response = await apiClient.get<ScanResponse>('/api/scan');
      return response.data;
    }, 2000); // Higher threshold for long-running operation
  },

  /** Invalidate cache */
  invalidateCache: async (scanType?: 'quick_scan' | 'full_scan'): Promise<{ message: string }> => {
    return measureAsync('API: invalidateCache', async () => {
      const response = await apiClient.delete<{ message: string }>('/api/cache', {
        params: scanType ? { scan_type: scanType } : undefined
      });
      return response.data;
    });
  },

  /** Derived analytics cache status */
  getAnalyticsStatus: async (): Promise<any> => {
    return measureAsync('API: analyticsStatus', async () => {
      const response = await apiClient.get('/api/analytics/status');
      return response.data;
    }, 200);
  },

  /** Start derived analytics computation (if needed) */
  startAnalytics: async (): Promise<any> => {
    return measureAsync('API: analyticsStart', async () => {
      const response = await apiClient.post('/api/analytics/start');
      return response.data;
    }, 500);
  },

  /** Get per-view derived analytics */
  getAnalyticsView: async (view: string, params?: Record<string, any>): Promise<any> => {
    return measureAsync(`API: analyticsView:${view}`, async () => {
      const response = await apiClient.get(`/api/analytics/view/${view}`, { params });
      return response.data;
    }, 500);
  },
};

export default apiClient;





