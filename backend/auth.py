"""Google Drive OAuth authentication module."""
import os
import json
from pathlib import Path
from typing import Optional

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Scopes required for Google Drive API
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']


def get_credentials_path() -> Path:
    """Get the path to credentials.json file."""
    project_root = Path(__file__).parent.parent
    return project_root / 'credentials.json'


def get_token_path() -> Path:
    """Get the path to token.json file."""
    project_root = Path(__file__).parent.parent
    return project_root / 'token.json'


def authenticate() -> build:
    """
    Authenticate and return Drive service.
    
    Handles OAuth flow:
    1. Check for existing token.json
    2. Refresh token if expired
    3. Run OAuth flow if no valid credentials
    4. Save credentials for next run
    
    Returns:
        Google Drive API service object
    """
    creds = None
    token_path = get_token_path()
    credentials_path = get_credentials_path()
    
    # Load existing token if available
    if token_path.exists():
        try:
            with open(token_path, 'r') as token:
                creds_data = json.load(token)
                creds = Credentials.from_authorized_user_info(creds_data, SCOPES)
        except Exception as e:
            print(f"Error loading token: {e}")
            creds = None
    
    # If no valid credentials, authenticate
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            # Refresh expired token
            try:
                creds.refresh(Request())
            except Exception as e:
                print(f"Error refreshing token: {e}")
                creds = None
        
        if not creds:
            # Run OAuth flow
            if not credentials_path.exists():
                raise FileNotFoundError(
                    f"credentials.json not found at {credentials_path}. "
                    "Please download OAuth credentials from Google Cloud Console."
                )
            
            flow = InstalledAppFlow.from_client_secrets_file(
                str(credentials_path), SCOPES
            )
            creds = flow.run_local_server(port=0)
        
        # Save credentials for next run
        try:
            with open(token_path, 'w') as token:
                token.write(creds.to_json())
        except Exception as e:
            print(f"Warning: Could not save token: {e}")
    
    # Build and return Drive service
    return build('drive', 'v3', credentials=creds)

