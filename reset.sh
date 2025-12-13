#!/bin/bash
# Full reset/cleanup script for Google Drive Manager
# Removes all generated files, caches, and optionally credentials

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if colors should be used
if [ ! -t 1 ]; then
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

echo -e "${BLUE}=== Google Drive Manager - Full Reset ===${NC}"
echo ""

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$PROJECT_ROOT"

# Remove Python virtual environment
if [ -d "venv" ]; then
    echo -e "${YELLOW}Removing venv...${NC}"
    rm -rf venv
    echo -e "${GREEN}✓ venv removed${NC}"
fi

# Remove node_modules
if [ -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}Removing frontend/node_modules...${NC}"
    rm -rf frontend/node_modules
    echo -e "${GREEN}✓ node_modules removed${NC}"
fi

# Remove Python caches
echo -e "${YELLOW}Removing Python caches...${NC}"
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true
find . -type f -name "*.pyo" -delete 2>/dev/null || true
find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
echo -e "${GREEN}✓ Python caches removed${NC}"

# Remove frontend build artifacts
if [ -d "frontend/dist" ]; then
    echo -e "${YELLOW}Removing frontend/dist...${NC}"
    rm -rf frontend/dist
    echo -e "${GREEN}✓ dist removed${NC}"
fi

if [ -d "frontend/.vite" ]; then
    echo -e "${YELLOW}Removing frontend/.vite...${NC}"
    rm -rf frontend/.vite
    echo -e "${GREEN}✓ .vite removed${NC}"
fi

if [ -d "frontend/build" ]; then
    echo -e "${YELLOW}Removing frontend/build...${NC}"
    rm -rf frontend/build
    echo -e "${GREEN}✓ build removed${NC}"
fi

# Remove OS-specific files
echo -e "${YELLOW}Removing OS-specific files...${NC}"
find . -name ".DS_Store" -delete 2>/dev/null || true
find . -name "Thumbs.db" -delete 2>/dev/null || true
find . -name "desktop.ini" -delete 2>/dev/null || true
echo -e "${GREEN}✓ OS-specific files removed${NC}"

# Remove log files
echo -e "${YELLOW}Removing log files...${NC}"
find . -name "*.log" -delete 2>/dev/null || true
find . -name "*.log.*" -delete 2>/dev/null || true
echo -e "${GREEN}✓ Log files removed${NC}"

# Ask about credentials/tokens
echo ""
echo -e "${YELLOW}Remove credentials and tokens? (y/N)${NC}"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    if [ -f "credentials.json" ]; then
        rm -f credentials.json
        echo -e "${GREEN}✓ credentials.json removed${NC}"
    fi
    if [ -f "token.json" ]; then
        rm -f token.json
        echo -e "${GREEN}✓ token.json removed${NC}"
    fi
    if [ -f "token.pickle" ]; then
        rm -f token.pickle
        echo -e "${GREEN}✓ token.pickle removed${NC}"
    fi
else
    echo -e "${BLUE}Keeping credentials and tokens${NC}"
fi

# Clean npm cache (optional)
echo ""
echo -e "${YELLOW}Clean npm cache? (y/N)${NC}"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    npm cache clean --force 2>/dev/null || true
    echo -e "${GREEN}✓ npm cache cleaned${NC}"
fi

echo ""
echo -e "${GREEN}=== Reset Complete ===${NC}"
echo ""
echo "Run './scripts/init.sh' to reinitialize the environment"
echo ""

