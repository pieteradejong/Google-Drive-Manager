# Google Drive Manager

A comprehensive tool for analyzing, visualizing, and managing Google Drive storage with an interactive web interface.

## Features

- **Quick Scan**: Fast overview of Drive storage and top-level folders (5-10 seconds)
- **Full Scan**: Complete analysis of all files with folder size calculations (2-5 minutes)
- **Interactive Visualizations**: Multiple visualization modes for exploring your Drive structure
- **Progress Tracking**: Real-time progress indicators for background scans
- **Smart Caching**: Intelligent cache invalidation based on Drive changes

## Quick Start

1. **Set up environment:**
   ```bash
   ./scripts/init.sh
   ```

2. **Get Google OAuth credentials:**
   - See [CREDENTIALS_SETUP.md](CREDENTIALS_SETUP.md) for detailed instructions
   - Or use environment variables (see [SETUP.md](SETUP.md))

3. **Start the application:**
   ```bash
   ./run.sh
   ```

4. **Access the app:**
   - Frontend: http://localhost:5173
   - Backend API docs: http://localhost:8000/docs

## Design Decisions

This section documents key architectural and design decisions made during development.

### Authentication & Credentials

- **Environment Variables First**: OAuth credentials can be provided via environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) as the primary method
- **Fallback to File**: If environment variables are not set, falls back to `credentials.json` file
- **Token Persistence**: OAuth tokens are saved to `token.json` for reuse across sessions
- **Security**: All credential files are gitignored and should never be committed

### Progressive Scanning Strategy

- **Two-Phase Approach**: 
  - **Quick Scan**: Fast overview (1-3 API calls) providing immediate feedback
  - **Full Scan**: Complete analysis (background process) with progress tracking
- **Rationale**: Users get instant feedback while full analysis runs in background
- **UI Flow**: 
  - Initial state → Quick Scan button
  - After quick scan → Full Scan button (enabled)
  - After full scan → Rescan button

### Background Processing

- **Threading Model**: Full scans run in background threads to avoid blocking API requests
- **State Management**: In-memory dictionary (`_scan_states`) tracks scan progress
- **Polling Pattern**: Frontend polls status endpoint every 2 seconds during scans
- **Progress Tracking**: Real-time updates include stage, percentage, pages, and files fetched

### User Experience

- **Placeholder for Quick Scan**: After quick scan, shows informative placeholder instead of empty visualizations
- **Clear Expectations**: Button descriptions explain what each scan provides and expected duration
- **Visual Feedback**: Progress bars, loading states, and status indicators throughout
- **Error Handling**: Descriptive error messages with setup instructions when credentials are missing

### Caching Strategy

- **Hybrid Approach**: 
  - Server-side caching for expensive full scans (file-based JSON)
  - Client-side caching via TanStack Query for quick scans
- **Smart Invalidation**: Uses Drive API's recently modified files check to detect changes
- **TTL Strategy**: 
  - Quick scan: 1 hour (time-based)
  - Full scan: 7 days OR until Drive changes detected
- **See [CACHING_STRATEGY.md](CACHING_STRATEGY.md) for detailed implementation plan**

### Data Models

- **Pydantic Models**: All API responses use Pydantic for validation and serialization
- **TypeScript Interfaces**: Frontend types mirror backend models for type safety
- **ScanResponse**: Complete file tree with `children_map` for hierarchy
- **QuickScanResponse**: Lightweight response with overview and top folders only

### API Design

- **RESTful Endpoints**: 
  - `GET /api/health` - Health check
  - `GET /api/scan/quick` - Quick scan
  - `POST /api/scan/full/start` - Start full scan
  - `GET /api/scan/full/status/{scan_id}` - Get scan progress
- **Response Models**: Consistent response structure with error handling
- **CORS**: Configured for local development (ports 5173, 3000)

### Frontend Architecture

- **React Hooks**: Custom hooks (`useQuickScan`, `useFullScan`) encapsulate API logic
- **State Management**: 
  - Zustand for UI state (view mode)
  - React state for component-specific data
  - TanStack Query for server state (planned)
- **Component Structure**: 
  - `DriveVisualizer`: Main container component
  - `ListView`: Hierarchical list view
  - Multiple experiment views: Folder Depth, Duplicate Finder, Orphaned Files, and more
- **Type Safety**: Full TypeScript coverage with strict type checking

### Testing Strategy

- **Backend Tests**: Pytest with comprehensive coverage (90%+)
- **API Integration Tests**: Included in `test.sh` for end-to-end validation
- **Test Organization**: Separate test files per module (`test_auth.py`, `test_drive_api.py`, etc.)
- **Mocking**: Extensive use of mocks for Drive API calls in tests

### Development Tools

- **Scripts**: 
  - `run.sh`: Start backend/frontend/both
  - `test.sh`: Run test suite (backend, frontend, linting, type-check)
  - `scripts/init.sh`: Clean environment setup
  - `scripts/reset.sh`: Full cleanup
- **Linting**: Flake8 for Python, ESLint for TypeScript
- **Type Checking**: mypy for Python, tsc for TypeScript

### File Organization

- **Backend**: Modular structure with separate files for auth, API operations, models
- **Frontend**: Feature-based organization (components, hooks, stores, types)
- **Documentation**: Separate files for setup, credentials, caching strategy
- **Gitignore**: Comprehensive ignore patterns for credentials, tokens, caches, build artifacts

### Error Handling

- **Graceful Degradation**: Falls back to time-based cache validation if Drive API check fails
- **User-Friendly Messages**: Clear error messages with actionable next steps
- **Logging**: Print statements for debugging (can be enhanced with proper logging)
- **Exception Handling**: Try-catch blocks with proper error propagation

### Performance Considerations

- **Pagination**: Drive API calls use `pageSize=1000` for efficiency
- **Background Processing**: Long-running scans don't block API
- **Progressive Loading**: Quick scan provides immediate results
- **Caching**: Reduces API calls and improves response times (planned)

### Security

- **Credentials**: Never committed to git, support for environment variables
- **OAuth Scopes**: Minimal required scope (`drive.readonly`)
- **CORS**: Restricted to localhost in development
- **Token Storage**: Local file system (consider encryption for production)

## Project Structure

```
Google-Drive-Manager/
├── backend/              # FastAPI backend
│   ├── main.py          # API endpoints
│   ├── auth.py          # OAuth authentication
│   ├── drive_api.py     # Drive API operations
│   └── models.py        # Pydantic models
├── frontend/             # React + Vite frontend
│   └── src/
│       ├── components/  # React components
│       ├── hooks/       # Custom React hooks
│       ├── stores/      # Zustand stores
│       └── api/         # API client
├── scripts/             # Setup scripts
├── cache/               # Cache storage (gitignored)
├── credentials.json     # OAuth credentials (gitignored)
└── token.json          # Auth token (gitignored)
```

## Documentation

- [SETUP.md](SETUP.md) - Detailed setup instructions
- [CREDENTIALS_SETUP.md](CREDENTIALS_SETUP.md) - OAuth credentials guide
- [PROJECT_PLAN.md](PROJECT_PLAN.md) - Project roadmap and phases
- [CACHING_STRATEGY.md](CACHING_STRATEGY.md) - Caching implementation plan

## License

MIT
