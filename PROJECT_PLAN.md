# Google Drive Cleanup Tool - MVP Plan

A comprehensive tool for analyzing, visualizing, and cleaning up Google Drive storage with an interactive web interface.

## Tech Stack

### Backend
- **FastAPI** - Modern, fast Python web framework with async support
- **Uvicorn** - ASGI server for FastAPI
- **Google Drive API** - Official Python client library
- **Pydantic** - Data validation and settings management
- **Python 3.10+**

### Frontend
- **Vite** - Next-generation frontend build tool
- **React 18** - UI library
- **TypeScript** - Type-safe JavaScript
- **Zustand** - Lightweight state management
- **TanStack Query** - Server state management and data fetching
- **Tailwind CSS** - Utility-first CSS framework
- **D3.js** - Data visualization library for treemap
- **Lucide React** - Icon library
- **Axios** - HTTP client

## Project Structure

```
Google-Drive-Manager/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── auth.py              # Google Drive OAuth authentication
│   ├── drive_api.py         # Core Drive API operations
│   ├── models.py            # Pydantic models for API responses
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Main app component
│   │   ├── main.tsx         # React entry point
│   │   ├── components/
│   │   │   ├── DriveVisualizer.tsx
│   │   │   ├── TreemapView.tsx
│   │   │   └── ListView.tsx
│   │   ├── hooks/
│   │   │   └── useDriveScan.ts
│   │   ├── stores/
│   │   │   └── visualizationStore.ts
│   │   ├── types/
│   │   │   └── drive.ts
│   │   └── api/
│   │       └── client.ts
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── tailwind.config.js
├── scripts/
│   ├── init.sh              # Clean initialization script
│   └── reset.sh             # Full reset/cleanup script
├── run.sh                    # Start application script
├── test.sh                   # Test suite script
├── credentials.json          # Google OAuth credentials (gitignored)
├── token.json                # User auth token (gitignored)
├── .env.example
├── .gitignore
└── README.md
```

## Setup Instructions

### 1. Google Cloud Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google Drive API
4. Create OAuth 2.0 credentials (Desktop app)
5. Download credentials as `credentials.json`
6. Place `credentials.json` in project root

### 2. Environment Setup

**Quick Start:**
```bash
# Initialize environment (creates venv, installs dependencies)
./scripts/init.sh

# Start the application (backend + frontend)
./run.sh
```

**Manual Setup:**
```bash
# Backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r backend/requirements.txt

# Frontend
cd frontend
npm install
```

### 3. Running the Application

**Using scripts (recommended):**
```bash
./run.sh              # Start both backend and frontend
./run.sh backend       # Start only backend
./run.sh frontend      # Start only frontend
```

**Manual:**
```bash
# Backend (in venv)
uvicorn backend.main:app --reload --port 8000

# Frontend (in frontend directory)
npm run dev           # Runs on port 5173
```

## MVP Features

### Phase 1: Scan & Visualize (Current MVP)
- ✅ Scan entire Google Drive
- ✅ Build folder/file tree structure
- ✅ Calculate folder sizes recursively
- ✅ Treemap visualization (D3.js)
- ✅ List/tree view with hierarchy
- ✅ Toggle between views
- ✅ Display file/folder metadata

### Phase 2: Find Large Files (Planned)
- Find files above size thresholds
- Filter/search UI
- Highlight large files in visualization
- Backend: `GET /api/analysis/large-files?min_size_mb=X`

### Phase 3: Find Duplicates (Planned)
- Detect duplicate files by name/content hash
- Group duplicates for comparison
- Backend: `GET /api/analysis/duplicates`

### Phase 4: Basic Cleanup (Planned)
- Move files to trash (recoverable)
- Permanently delete files
- Batch operations
- Confirmation dialogs
- Backend: `POST /api/cleanup/trash`, `POST /api/cleanup/delete`

### Phase 5: Advanced Analysis (Planned)
- Find old files
- Find empty folders
- Detect deep nesting
- Analysis dashboard

## API Endpoints (MVP)

### Backend Endpoints
- `GET /api/health` - Health check
- `GET /api/scan` - Scan entire Drive, return file structure and tree

### Response Format
```json
{
  "files": [...],
  "children_map": {...},
  "stats": {
    "total_files": 0,
    "total_size": 0,
    "folder_count": 0
  }
}
```

## Scripts

### `scripts/init.sh`
Clean initialization script that:
- Removes existing venv, node_modules, caches
- Creates fresh Python virtual environment
- Installs backend dependencies
- Installs frontend dependencies
- Verifies installation

### `scripts/reset.sh`
Full reset/cleanup script that:
- Removes venv, node_modules
- Removes Python caches (__pycache__, .pytest_cache, *.pyc)
- Removes frontend build artifacts (dist/, .vite/)
- Removes OS-specific files (.DS_Store, Thumbs.db)
- Option to remove credentials/tokens (with confirmation)

### `run.sh`
Start application script:
- `./run.sh` - Start both backend and frontend
- `./run.sh backend` - Start only backend server
- `./run.sh frontend` - Start only frontend dev server
- Features: Background process management, signal trapping, port conflict detection

### `test.sh`
Test suite script:
- `./test.sh` - Run all tests (backend + frontend)
- `./test.sh backend` - Run only backend tests (pytest)
- `./test.sh frontend` - Run only frontend tests (vitest)
- `./test.sh lint` - Run linting checks
- `./test.sh type-check` - Run TypeScript type checking
- `./test.sh all` - Run tests, linting, and type checking

## Dependencies

### Backend (`backend/requirements.txt`)
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
google-api-python-client==2.108.0
google-auth-httplib2==0.1.1
google-auth-oauthlib==1.1.0
pydantic==2.5.0
python-dotenv==1.0.0
```

### Frontend (`frontend/package.json`)
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "vite": "^5.0.0",
    "typescript": "^5.3.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.4.0",
    "axios": "^1.6.0",
    "d3": "^7.8.0",
    "tailwindcss": "^3.3.0",
    "lucide-react": "^0.263.1",
    "date-fns": "^2.30.0"
  }
}
```

## Safety Notes

1. Always test with trash first before permanent deletion
2. Backup important files before running cleanup operations
3. Review lists carefully before confirming deletions
4. Check API quotas - Drive API has daily limits
5. Keep credentials secure - Never commit `credentials.json` or `token.json`

## Git Configuration

### `.gitignore`
```
# Credentials
credentials.json
token.json
token.pickle

# Python
__pycache__/
*.py[cod]
*$py.class
venv/
*.so
.Python

# Node
node_modules/
npm-debug.log*
build/
dist/
.vite/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
```

## License

MIT

## Contributing

Pull requests welcome! Please ensure:
- Code follows PEP 8 (Python) and TypeScript style guidelines
- All API calls include error handling
- User confirmation required for destructive operations
