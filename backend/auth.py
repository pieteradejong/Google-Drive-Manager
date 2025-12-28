"""Google Drive OAuth authentication module."""

import os
import json
from pathlib import Path
from typing import Optional, Dict, Any

from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from .utils.logger import PerformanceLogger

# Load environment variables from .env file
load_dotenv()

# Scopes required for Google Drive API
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

# Auth logger
auth_logger = PerformanceLogger("auth")


def get_credentials_path() -> Path:
    """Get the path to credentials.json file."""
    project_root = Path(__file__).parent.parent
    return project_root / "credentials.json"


def get_credentials_from_env() -> Optional[Dict[str, Any]]:
    """
    Get OAuth credentials from environment variables.

    Returns:
        Dictionary with credentials structure, or None if not all vars are set
    """
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    project_id = os.getenv("GOOGLE_PROJECT_ID")

    if not all([client_id, client_secret]):
        return None

    # Construct credentials structure matching credentials.json format
    return {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "project_id": project_id or "default-project",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "redirect_uris": ["http://localhost"],
        }
    }


def get_token_path() -> Path:
    """Get the path to token.json file."""
    project_root = Path(__file__).parent.parent
    return project_root / "token.json"


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
        auth_logger.info("token_load", message="Loading existing token")
        try:
            with open(token_path, "r") as token:
                creds_data = json.load(token)
                creds = Credentials.from_authorized_user_info(creds_data, SCOPES)
            auth_logger.info("token_load", message="Token loaded successfully")
        except Exception as e:
            auth_logger.error("token_load", message=f"Error loading token: {e}")
            creds = None
    else:
        auth_logger.info("token_load", message="No existing token found")

    # If no valid credentials, authenticate
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            # Refresh expired token
            auth_logger.info("token_refresh", message="Token expired, attempting refresh")
            try:
                creds.refresh(Request())
                auth_logger.info("token_refresh", message="Token refreshed successfully")
            except Exception as e:
                auth_logger.error("token_refresh", message=f"Error refreshing token: {e}")
                creds = None

        if not creds:
            # Run OAuth flow
            # Try environment variables first, then fall back to credentials.json
            credentials_dict = get_credentials_from_env()

            if credentials_dict:
                # Use credentials from environment variables
                auth_logger.info(
                    "oauth_flow",
                    message="Starting OAuth flow using environment variables",
                )
                flow = InstalledAppFlow.from_client_secrets_dict(
                    credentials_dict, SCOPES
                )
                creds = flow.run_local_server(port=0)
                auth_logger.info(
                    "oauth_flow", message="OAuth flow completed (env vars source)"
                )
            elif credentials_path.exists():
                # Fall back to credentials.json file
                auth_logger.info(
                    "oauth_flow",
                    message=f"Starting OAuth flow using credentials.json",
                )
                flow = InstalledAppFlow.from_client_secrets_file(
                    str(credentials_path), SCOPES
                )
                creds = flow.run_local_server(port=0)
                auth_logger.info(
                    "oauth_flow", message="OAuth flow completed (file source)"
                )
            else:
                auth_logger.error(
                    "oauth_flow",
                    message="No credentials found (neither env vars nor credentials.json)",
                )
                raise FileNotFoundError(
                    f"Google OAuth credentials not found. "
                    "Please either:\n"
                    "  1. Set environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (and optionally GOOGLE_PROJECT_ID)\n"
                    "  2. Or add credentials.json to the project root.\n"
                    "See CREDENTIALS_SETUP.md or SETUP.md for instructions."
                )

        # Save credentials for next run
        try:
            with open(token_path, "w") as token:
                token.write(creds.to_json())
            auth_logger.info("token_save", message="Token saved successfully")
        except Exception as e:
            auth_logger.warning("token_save", message=f"Could not save token: {e}")

    # Build and return Drive service
    auth_logger.info("authenticate", message="Building Drive service")
    return build("drive", "v3", credentials=creds)
