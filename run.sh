#!/bin/bash
# Start application script for Google Drive Manager
# Can start backend, frontend, or both

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if colors should be used
if [ ! -t 1 ]; then
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    NC=''
fi

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"
cd "$PROJECT_ROOT"

# Function to cleanup background processes
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
        echo -e "${BLUE}Backend stopped${NC}"
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
        echo -e "${BLUE}Frontend stopped${NC}"
    fi
    exit 0
}

# Trap signals for cleanup
trap cleanup SIGINT SIGTERM

# Check for required tools
check_requirements() {
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}Error: python3 is not installed${NC}"
        exit 1
    fi
    
    if [ "$1" != "backend" ]; then
        if ! command -v node &> /dev/null; then
            echo -e "${RED}Error: node is not installed${NC}"
            exit 1
        fi
        
        if ! command -v npm &> /dev/null; then
            echo -e "${RED}Error: npm is not installed${NC}"
            exit 1
        fi
    fi
}

# Check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo -e "${RED}Error: Port $port is already in use${NC}"
        exit 1
    fi
}

# Start backend
start_backend() {
    echo -e "${CYAN}Starting backend...${NC}"
    
    if [ ! -d "venv" ]; then
        echo -e "${RED}Error: Virtual environment not found. Run './scripts/init.sh' first${NC}"
        exit 1
    fi
    
    if [ ! -f "backend/main.py" ]; then
        echo -e "${YELLOW}Warning: backend/main.py not found. Backend may not be implemented yet${NC}"
        return
    fi
    
    check_port 8000
    
    source venv/bin/activate
    
    # Start uvicorn in background
    uvicorn backend.main:app --reload --port 8000 --host 0.0.0.0 > /tmp/backend.log 2>&1 &
    BACKEND_PID=$!
    
    echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"
    echo -e "${BLUE}  Backend URL: http://localhost:8000${NC}"
    echo -e "${BLUE}  API docs: http://localhost:8000/docs${NC}"
    echo ""
}

# Start frontend
start_frontend() {
    echo -e "${CYAN}Starting frontend...${NC}"
    
    if [ ! -d "frontend" ]; then
        echo -e "${RED}Error: frontend directory not found${NC}"
        exit 1
    fi
    
    if [ ! -d "frontend/node_modules" ]; then
        echo -e "${YELLOW}Warning: node_modules not found. Run './scripts/init.sh' first${NC}"
        return
    fi
    
    check_port 5173
    
    cd frontend
    
    # Start vite dev server in background
    npm run dev > /tmp/frontend.log 2>&1 &
    FRONTEND_PID=$!
    
    cd ..
    
    echo -e "${GREEN}✓ Frontend started (PID: $FRONTEND_PID)${NC}"
    echo -e "${BLUE}  Frontend URL: http://localhost:5173${NC}"
    echo ""
}

# Main logic
MODE=${1:-both}

case $MODE in
    backend)
        check_requirements backend
        start_backend
        echo -e "${GREEN}Backend running. Press Ctrl+C to stop${NC}"
        wait $BACKEND_PID
        ;;
    frontend)
        check_requirements frontend
        start_frontend
        echo -e "${GREEN}Frontend running. Press Ctrl+C to stop${NC}"
        wait $FRONTEND_PID
        ;;
    both|*)
        check_requirements both
        start_backend
        start_frontend
        echo -e "${GREEN}Both services running. Press Ctrl+C to stop${NC}"
        echo -e "${YELLOW}Logs:${NC}"
        echo -e "  Backend: tail -f /tmp/backend.log"
        echo -e "  Frontend: tail -f /tmp/frontend.log"
        echo ""
        # Wait for both processes
        wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
        ;;
esac

