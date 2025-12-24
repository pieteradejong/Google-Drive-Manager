"""Tests for backend/auth.py."""

import pytest
import json
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from backend.auth import authenticate, get_credentials_path, get_token_path, SCOPES


@pytest.mark.unit
@pytest.mark.auth
class TestAuthPaths:
    """Tests for path helper functions."""

    def test_get_credentials_path(self):
        """Test getting credentials path."""
        path = get_credentials_path()
        assert isinstance(path, Path)
        assert path.name == "credentials.json"
        assert path.parent.name == "Google-Drive-Manager"

    def test_get_token_path(self):
        """Test getting token path."""
        path = get_token_path()
        assert isinstance(path, Path)
        assert path.name == "token.json"
        assert path.parent.name == "Google-Drive-Manager"


@pytest.mark.unit
@pytest.mark.auth
class TestAuthenticate:
    """Tests for authenticate function."""

    @patch("backend.auth.build")
    @patch("backend.auth.InstalledAppFlow")
    @patch("backend.auth.get_token_path")
    @patch("backend.auth.get_credentials_path")
    def test_authenticate_with_existing_token(
        self,
        mock_creds_path,
        mock_token_path,
        mock_flow_class,
        mock_build,
        tmp_path,
        mock_credentials,
    ):
        """Test authentication with existing valid token."""
        # Setup paths
        creds_file = tmp_path / "credentials.json"
        token_file = tmp_path / "token.json"
        mock_creds_path.return_value = creds_file
        mock_token_path.return_value = token_file

        # Create token file
        token_data = {
            "token": "test_token",
            "refresh_token": "test_refresh_token",
            "client_id": "test_client_id",
            "client_secret": "test_client_secret",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        token_file.write_text(json.dumps(token_data))

        # Mock Credentials.from_authorized_user_info
        with patch("backend.auth.Credentials") as mock_creds_class:
            mock_creds_class.from_authorized_user_info.return_value = mock_credentials
            mock_service = MagicMock()
            mock_build.return_value = mock_service

            service = authenticate()

            assert service == mock_service
            mock_build.assert_called_once_with(
                "drive", "v3", credentials=mock_credentials
            )

    @patch("backend.auth.build")
    @patch("backend.auth.InstalledAppFlow")
    @patch("backend.auth.get_token_path")
    @patch("backend.auth.get_credentials_path")
    def test_authenticate_refresh_expired_token(
        self,
        mock_creds_path,
        mock_token_path,
        mock_flow_class,
        mock_build,
        tmp_path,
        mock_credentials,
    ):
        """Test authentication with expired token that can be refreshed."""
        # Setup paths
        creds_file = tmp_path / "credentials.json"
        token_file = tmp_path / "token.json"
        mock_creds_path.return_value = creds_file
        mock_token_path.return_value = token_file

        # Create token file
        token_file.write_text(json.dumps({"token": "expired"}))

        # Mock expired credentials that can refresh
        expired_creds = Mock()
        expired_creds.valid = False
        expired_creds.expired = True
        expired_creds.refresh_token = "refresh_token"

        with patch("backend.auth.Credentials") as mock_creds_class:
            mock_creds_class.from_authorized_user_info.return_value = expired_creds
            with patch("backend.auth.Request") as mock_request:
                expired_creds.refresh = MagicMock()

                mock_service = MagicMock()
                mock_build.return_value = mock_service

                service = authenticate()

                assert expired_creds.refresh.called
                assert service == mock_service

    @patch("backend.auth.build")
    @patch("backend.auth.InstalledAppFlow")
    @patch("backend.auth.get_token_path")
    @patch("backend.auth.get_credentials_path")
    def test_authenticate_no_token_run_flow(
        self, mock_creds_path, mock_token_path, mock_flow_class, mock_build, tmp_path
    ):
        """Test authentication when no token exists, runs OAuth flow."""
        # Setup paths
        creds_file = tmp_path / "credentials.json"
        token_file = tmp_path / "token.json"
        mock_creds_path.return_value = creds_file
        mock_token_path.return_value = token_file

        # Create credentials file
        creds_data = {
            "installed": {"client_id": "test_id", "client_secret": "test_secret"}
        }
        creds_file.write_text(json.dumps(creds_data))

        # Token file doesn't exist
        assert not token_file.exists()

        # Mock OAuth flow
        mock_flow = MagicMock()
        mock_flow.run_local_server.return_value = mock_credentials = Mock()
        mock_flow_class.from_client_secrets_file.return_value = mock_flow
        mock_credentials.to_json.return_value = '{"token": "new_token"}'

        mock_service = MagicMock()
        mock_build.return_value = mock_service

        service = authenticate()

        assert mock_flow.run_local_server.called
        assert service == mock_service

    @patch("backend.auth.get_credentials_from_env")
    @patch("backend.auth.get_token_path")
    @patch("backend.auth.get_credentials_path")
    def test_authenticate_no_credentials_file(
        self, mock_creds_path, mock_token_path, mock_get_env, tmp_path
    ):
        """Test authentication raises error when credentials.json doesn't exist."""
        creds_file = tmp_path / "nonexistent.json"
        token_file = tmp_path / "token.json"
        mock_creds_path.return_value = creds_file
        mock_token_path.return_value = token_file
        # Mock environment variables to return None (not set)
        mock_get_env.return_value = None

        # Ensure neither file exists
        assert not creds_file.exists()
        assert not token_file.exists()

        with pytest.raises(FileNotFoundError) as exc_info:
            authenticate()

        assert (
            "credentials" in str(exc_info.value).lower()
            or "not found" in str(exc_info.value).lower()
        )

    @patch("backend.auth.build")
    @patch("backend.auth.Credentials")
    @patch("backend.auth.get_token_path")
    @patch("backend.auth.get_credentials_path")
    def test_authenticate_saves_token(
        self,
        mock_creds_path,
        mock_token_path,
        mock_creds_class,
        mock_build,
        tmp_path,
        mock_credentials,
    ):
        """Test that authenticate saves token after OAuth flow."""
        creds_file = tmp_path / "credentials.json"
        token_file = tmp_path / "token.json"
        mock_creds_path.return_value = creds_file
        mock_token_path.return_value = token_file

        # Create credentials file
        creds_file.write_text(json.dumps({"installed": {}}))

        # Token file doesn't exist
        token_file.unlink(missing_ok=True)

        with patch("builtins.open", create=True) as mock_open:
            mock_creds_class.from_authorized_user_info.side_effect = Exception(
                "No token"
            )
            with patch("backend.auth.InstalledAppFlow") as mock_flow_class:
                mock_flow = MagicMock()
                mock_flow.run_local_server.return_value = mock_credentials
                mock_flow_class.from_client_secrets_file.return_value = mock_flow
                mock_credentials.to_json.return_value = '{"token": "saved"}'

                mock_service = MagicMock()
                mock_build.return_value = mock_service

                authenticate()

                # Should attempt to save token
                assert mock_open.called
