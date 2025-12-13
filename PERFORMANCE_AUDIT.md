# Performance & Memory Audit Report

## Critical Issues Found

### 1. **Bundle Size - 351KB (109KB gzipped)**
- **Issue**: Large JavaScript bundle due to:
  - D3.js imported as `* as d3` (entire library ~200KB)
  - All 10+ experiment components imported at once
  - date-fns library (~50KB)
  - lucide-react icons (all icons loaded)
- **Impact**: Slow initial load, high memory usage
- **Fix**: Code splitting, lazy loading, tree-shaking

### 2. **Memory Leaks**
- **Issue**: D3.js visualizations (TreemapView, SunburstView, SankeyView) don't clean up:
  - No cleanup function in useEffect
  - Event listeners not removed
  - SVG elements accumulate on re-render
- **Impact**: Memory grows over time, browser becomes unresponsive
- **Fix**: Add cleanup functions to all useEffect hooks

### 3. **Missing Import**
- **Issue**: `SunburstView.tsx` uses `useState` but doesn't import it
- **Impact**: Runtime error, component crashes
- **Fix**: Add missing import

### 4. **No Virtualization**
- **Issue**: Rendering potentially thousands of files at once:
  - ListView renders all files
  - TimelineView renders all files
  - TypeGroupedView renders all files
  - SearchFirstView renders all results
- **Impact**: Browser freezes with large datasets
- **Fix**: Implement virtual scrolling/windowing

### 5. **No Memoization**
- **Issue**: Expensive computations run on every render:
  - `buildFolderTree()` recalculated on every render
  - `groupByDatePeriod()` recalculated on every render
  - `groupByType()` recalculated on every render
  - File filtering/sorting recalculated
- **Impact**: Unnecessary CPU usage, laggy UI
- **Fix**: Use useMemo for expensive computations

### 6. **All Components Loaded**
- **Issue**: All experiment components imported at top level
- **Impact**: Unused code loaded, larger bundle
- **Fix**: Lazy load experiment components

### 7. **D3.js Full Import**
- **Issue**: `import * as d3 from 'd3'` imports entire library
- **Impact**: ~200KB of unused code
- **Fix**: Import only needed D3 modules

### 8. **No Debouncing**
- **Issue**: Search input triggers immediate filtering
- **Impact**: Laggy typing with large datasets
- **Fix**: Debounce search input

## Performance Metrics

### Bundle Size - BEFORE
- **Total JS**: 351.15 KB (109.63 KB gzipped)
- **CSS**: 17.42 KB (3.89 KB gzipped)
- **All components loaded**: Yes

### Bundle Size - AFTER ✅
- **Main JS**: 292.25 KB (93.39 KB gzipped) - **15% reduction**
- **CSS**: 17.42 KB (3.89 KB gzipped)
- **Experiment chunks** (lazy loaded):
  - FolderFirstView: 2.93 KB (1.17 KB gzipped)
  - SidebarTreeView: 3.07 KB (1.14 KB gzipped)
  - SearchFirstView: 4.06 KB (1.60 KB gzipped)
  - TypeGroupedView: 4.38 KB (1.59 KB gzipped)
  - SunburstView: 8.57 KB (3.64 KB gzipped)
  - Others: 2-3 KB each
- **Total initial load**: ~93 KB gzipped (only loads selected experiment)
- **Target**: < 200 KB gzipped ✅ **ACHIEVED**

### Memory Usage (Estimated)
- **Base React**: ~5 MB
- **D3.js**: ~10 MB
- **File data (10k files)**: ~5-10 MB
- **DOM nodes (all files rendered)**: ~50-100 MB
- **Total**: ~70-125 MB (can grow to 500MB+ with leaks)

## Recommended Fixes (Priority Order)

### High Priority - ✅ COMPLETED
1. ✅ Fix missing useState import in SunburstView
2. ✅ Add cleanup to all D3 useEffect hooks
3. ✅ Lazy load experiment components
4. ✅ Add useMemo for expensive computations
5. ✅ Tree-shake D3.js imports
6. ✅ Debounce search input

### Medium Priority - ⚠️ PENDING
7. ⚠️ Implement virtualization for large lists (react-window or react-virtualized)
8. ⚠️ Limit initial file rendering (pagination/windowing)
9. ⚠️ Add React.memo to prevent unnecessary re-renders

### Low Priority
9. ⚠️ Code split by route/feature
10. ⚠️ Optimize icon imports (only load used icons)

## Implementation Plan

### ✅ Completed Fixes

1. **Fixed missing useState import** in SunburstView
2. **Added cleanup functions** to all D3 visualization useEffect hooks (prevents memory leaks)
3. **Lazy loaded experiment components** - Reduces initial bundle by ~60 KB
4. **Added useMemo** for expensive computations:
   - `buildFolderTree()` in SidebarTreeView
   - `groupByDatePeriod()` in TimelineView
   - `groupByType()` in TypeGroupedView
   - Search filtering/sorting in SearchFirstView
5. **Tree-shaken D3.js imports** - Only import needed modules:
   - `d3-selection` for select()
   - `d3-hierarchy` for hierarchy/partition/treemap
   - `d3-scale` for scaleOrdinal
   - `d3-scale-chromatic` for schemeCategory10
   - `d3-shape` for arc
6. **Debounced search input** - 300ms delay prevents laggy typing

### ⚠️ Remaining Optimizations (Optional)

1. **Virtualization** - For lists with 1000+ items, use react-window
2. **React.memo** - Wrap components to prevent unnecessary re-renders
3. **Pagination** - Limit initial file rendering to first 100-500 items

## Results

- **Bundle size reduced**: 351 KB → 292 KB (15% reduction)
- **Initial load**: Only loads selected experiment (code splitting)
- **Memory leaks fixed**: All D3 visualizations properly cleaned up
- **Performance improved**: Memoization prevents expensive recalculations
- **Search responsiveness**: Debouncing eliminates lag

The application should now be significantly more responsive and use less memory.
