#!/bin/bash
# Clean initialization script for Google Drive Manager
# Removes existing environment, creates fresh venv, and installs all dependencies

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

echo -e "${BLUE}=== Google Drive Manager - Initialization ===${NC}"
echo ""

# Check for required tools
echo -e "${YELLOW}Checking required tools...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: python3 is not installed${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: node is not installed${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All required tools found${NC}"
echo ""

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$PROJECT_ROOT"

echo -e "${YELLOW}Cleaning existing environment...${NC}"

# Remove Python virtual environment
if [ -d "venv" ]; then
    echo "  Removing venv..."
    rm -rf venv
fi

# Remove node_modules
if [ -d "frontend/node_modules" ]; then
    echo "  Removing frontend/node_modules..."
    rm -rf frontend/node_modules
fi

# Remove Python caches
echo "  Removing Python caches..."
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true
find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true

# Remove frontend build artifacts
if [ -d "frontend/dist" ]; then
    echo "  Removing frontend/dist..."
    rm -rf frontend/dist
fi

if [ -d "frontend/.vite" ]; then
    echo "  Removing frontend/.vite..."
    rm -rf frontend/.vite
fi

echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

# Create Python virtual environment
echo -e "${YELLOW}Creating Python virtual environment...${NC}"
python3 -m venv venv
echo -e "${GREEN}✓ Virtual environment created${NC}"
echo ""

# Activate virtual environment
echo -e "${YELLOW}Installing backend dependencies...${NC}"
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip --quiet

# Install backend dependencies
if [ -f "backend/requirements.txt" ]; then
    pip install -r backend/requirements.txt
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"
else
    echo -e "${YELLOW}⚠ Warning: backend/requirements.txt not found${NC}"
fi

deactivate
echo ""

# Install frontend dependencies
if [ -d "frontend" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    cd frontend
    npm install
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
    cd ..
else
    echo -e "${YELLOW}⚠ Warning: frontend directory not found${NC}"
fi

echo ""
echo -e "${GREEN}=== Initialization Complete ===${NC}"
echo ""
echo "Next steps:"
echo "  1. Place your Google OAuth credentials.json in the project root"
echo "  2. Run './run.sh' to start the application"
echo ""

