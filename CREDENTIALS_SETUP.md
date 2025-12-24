# How to Add credentials.json

## Step-by-Step Guide

### 1. Go to Google Cloud Console
Open your browser and go to: **https://console.cloud.google.com/**

### 2. Create or Select a Project
- If you don't have a project, click **"Select a project"** → **"New Project"**
- Give it a name (e.g., "Drive Manager")
- Click **"Create"**
- Wait for the project to be created, then select it

### 3. Enable Google Drive API
- In the search bar at the top, type: **"Google Drive API"**
- Click on **"Google Drive API"** from the results
- Click the **"Enable"** button
- Wait for it to enable (may take a few seconds)

### 4. Create OAuth Credentials
- Click the **☰ (hamburger menu)** in the top left
- Go to **"APIs & Services"** → **"Credentials"**
- Click **"+ CREATE CREDENTIALS"** at the top
- Select **"OAuth client ID"**

### 5. Configure OAuth Consent Screen (First Time Only)
If this is your first time:
- You'll be prompted to configure the OAuth consent screen
- Choose **"External"** (unless you have a Google Workspace)
- Click **"Create"**
- Fill in:
  - **App name**: "Google Drive Manager" (or any name)
  - **User support email**: Your email
  - **Developer contact information**: Your email
- Click **"Save and Continue"**
- On "Scopes" page, click **"Save and Continue"**
- On "Test users" page, click **"Save and Continue"**
- Review and click **"Back to Dashboard"**

### 6. Create OAuth Client ID
- Application type: Select **"Desktop app"**
- Name: "Drive Manager Desktop" (or any name)
- Click **"Create"**

### 7. Download Credentials
- A popup will appear with your Client ID and Client Secret
- Click **"Download JSON"** button
- The file will be downloaded (usually named something like `client_secret_xxxxx.json`)

### 8. Add to Project
- Rename the downloaded file to: **`credentials.json`**
- Move it to your project root directory:
  ```
  /Users/pieterdejong/dev/projects/Google-Drive-Manager/credentials.json
  ```

### 9. Verify
Check that the file is in the right place:
```bash
ls -la credentials.json
```

You should see the file listed.

### 10. Restart the Application
- Stop the current `./run.sh` process (Ctrl+C)
- Restart it: `./run.sh`
- Now try clicking "Scan Drive" in the frontend

## File Structure Should Look Like:
```
Google-Drive-Manager/
├── credentials.json    ← This file should be here
├── backend/
├── frontend/
├── run.sh
└── ...
```

## What credentials.json Contains:
The file should look something like this:
```json
{
  "installed": {
    "client_id": "xxxxx.apps.googleusercontent.com",
    "project_id": "your-project-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "xxxxx",
    "redirect_uris": ["http://localhost"]
  }
}
```

## Troubleshooting

**File not found error?**
- Make sure the file is named exactly `credentials.json` (not `credentials.json.json`)
- Make sure it's in the project root (same directory as `run.sh`)
- Check with: `pwd` and `ls -la credentials.json`

**Still getting errors?**
- Make sure Google Drive API is enabled in your project
- Check that you selected "Desktop app" as the application type
- Verify the JSON file is valid: `cat credentials.json | python3 -m json.tool`

**First time authentication:**
- When you click "Scan Drive", a browser window will open
- Sign in with your Google account
- Click "Allow" to grant permissions
- The app will save a `token.json` file automatically







