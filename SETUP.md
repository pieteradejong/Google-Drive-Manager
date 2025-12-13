# Google Drive Manager - Setup Guide

## Quick Start

1. **Set up environment:**
   ```bash
   ./scripts/init.sh
   ```

2. **Get Google OAuth credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project (or select existing)
   - Enable Google Drive API
   - Go to "Credentials" → "Create Credentials" → "OAuth client ID"
   - Choose "Desktop app" as application type
   - Download the credentials JSON file
   - Rename it to `credentials.json` and place it in the project root

3. **Start the application:**
   ```bash
   ./run.sh
   ```

4. **Access the app:**
   - Frontend: http://localhost:5173
   - Backend API docs: http://localhost:8000/docs

## First Time Authentication

When you first click "Scan Drive":
1. A browser window will open for Google OAuth authentication
2. Sign in with your Google account
3. Grant permissions to access Google Drive
4. The app will save your token for future use

## Troubleshooting

### Error: "credentials.json not found"
- Make sure you've downloaded OAuth credentials from Google Cloud Console
- Place `credentials.json` in the project root (same directory as `run.sh`)
- The file should contain your OAuth client ID and secret

### Error: "500 Internal Server Error"
- Check backend logs in the terminal where you ran `./run.sh`
- Verify `credentials.json` exists and is valid JSON
- Make sure Google Drive API is enabled in your Google Cloud project

### Frontend can't connect to backend
- Ensure backend is running on port 8000
- Check that both services started successfully with `./run.sh`
- Verify no firewall is blocking localhost connections

## Project Structure

```
Google-Drive-Manager/
├── credentials.json      # Google OAuth credentials (you need to add this)
├── token.json           # Auto-generated after first auth
├── backend/             # FastAPI backend
├── frontend/            # React + Vite frontend
└── scripts/             # Setup scripts
```

## Next Steps

Once authenticated, you can:
- Click "Scan Drive" to visualize your Drive structure
- Switch between Treemap and List views
- Click files/folders to open them in Google Drive
- View statistics about your Drive usage






