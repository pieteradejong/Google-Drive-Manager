/** Zustand store for visualization state */
import { create } from 'zustand';
import type { ViewMode } from '../types/drive';

interface VisualizationState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
}

export const useVisualizationStore = create<VisualizationState>((set) => ({
  viewMode: 'treemap',
  setViewMode: (mode) => set({ viewMode: mode }),
  selectedFileId: null,
  setSelectedFileId: (id) => set({ selectedFileId: id }),
}));






