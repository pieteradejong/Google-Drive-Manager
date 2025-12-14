/** Zustand store for visualization state */
import { create } from 'zustand';
import type { ViewMode } from '../types/drive';

export type ExperimentType = 
  | 'folder-first'
  | 'sidebar-tree'
  | 'breadcrumb'
  | 'size-grid'
  | 'timeline'
  | 'type-grouped'
  | 'search-first'
  | 'card-view'
  | 'storage-dashboard'
  | 'large-files'
  | 'duplicate-finder'
  | 'file-age'
  | 'folder-depth'
  | 'activity-timeline'
  | 'shared-files'
  | 'orphaned-files'
  | 'folder-tree'
  | 'semantic-analysis'
  | 'age-semantic'
  | 'type-semantic'
  | 'list';

interface VisualizationState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  currentExperiment: ExperimentType;
  setCurrentExperiment: (experiment: ExperimentType) => void;
  currentFolderId: string | null; // null = root
  setCurrentFolderId: (id: string | null) => void;
  navigationHistory: string[]; // Array of folder IDs for breadcrumbs
  pushToHistory: (folderId: string) => void;
  popFromHistory: () => string | null;
}

export const useVisualizationStore = create<VisualizationState>((set) => ({
  viewMode: 'list',
  setViewMode: (mode) => set({ viewMode: mode }),
  selectedFileId: null,
  setSelectedFileId: (id) => set({ selectedFileId: id }),
  currentExperiment: 'folder-first',
  setCurrentExperiment: (experiment) => set({ currentExperiment: experiment }),
  currentFolderId: null,
  setCurrentFolderId: (id) => set({ currentFolderId: id }),
  navigationHistory: [],
  pushToHistory: (folderId) => set((state) => ({ 
    navigationHistory: [...state.navigationHistory, folderId] 
  })),
  popFromHistory: () => {
    let popped: string | null = null;
    set((state) => {
      if (state.navigationHistory.length > 0) {
        popped = state.navigationHistory[state.navigationHistory.length - 1];
        return { navigationHistory: state.navigationHistory.slice(0, -1) };
      }
      return state;
    });
    return popped;
  },
}));






