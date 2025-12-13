#!/bin/bash
# Helper script to check credentials.json setup

echo "=== Google Drive Manager - Credentials Check ==="
echo ""

if [ -f "credentials.json" ]; then
    echo "✓ credentials.json found"
    echo ""
    echo "File location: $(pwd)/credentials.json"
    echo ""
    echo "File size: $(wc -c < credentials.json) bytes"
    echo ""
    if command -v python3 &> /dev/null; then
        echo "Validating JSON format..."
        if python3 -m json.tool credentials.json > /dev/null 2>&1; then
            echo "✓ Valid JSON format"
            echo ""
            echo "File structure:"
            python3 -c "import json; data=json.load(open('credentials.json')); print('  - Has \"installed\" key:', 'installed' in data)"
        else
            echo "✗ Invalid JSON format"
        fi
    fi
else
    echo "✗ credentials.json NOT found"
    echo ""
    echo "To add credentials.json:"
    echo "1. Go to https://console.cloud.google.com/"
    echo "2. Create/select a project"
    echo "3. Enable Google Drive API"
    echo "4. Create OAuth credentials (Desktop app)"
    echo "5. Download JSON file"
    echo "6. Rename to credentials.json"
    echo "7. Place in: $(pwd)/"
    echo ""
    echo "See CREDENTIALS_SETUP.md for detailed instructions"
fi
echo ""
