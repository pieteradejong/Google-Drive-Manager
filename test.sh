#!/bin/bash
# Test suite script for Google Drive Manager
# Runs tests, linting, and type checking

# Don't use set -e here because we want to collect all failures

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

# Track exit codes
EXIT_CODE=0

# Function to run backend tests
run_backend_tests() {
    echo -e "${BLUE}=== Running Backend Tests ===${NC}"
    
    if [ ! -d "venv" ]; then
        echo -e "${YELLOW}Warning: Virtual environment not found. Skipping backend tests${NC}"
        return 1
    fi
    
    if [ ! -f "backend/main.py" ]; then
        echo -e "${YELLOW}Warning: backend/main.py not found. Skipping backend tests${NC}"
        return 1
    fi
    
    source venv/bin/activate
    
    # Check if pytest is installed
    if ! python -m pytest --version &>/dev/null; then
        echo -e "${YELLOW}Warning: pytest not installed. Skipping backend tests${NC}"
        deactivate
        return 1
    fi
    
    # Run pytest if test files exist
    if find backend/tests -name "test_*.py" 2>/dev/null | grep -q .; then
        python -m pytest backend/tests/ -v --tb=short || EXIT_CODE=1
    else
        echo -e "${YELLOW}No test files found in backend/tests/${NC}"
    fi
    
    deactivate
    echo ""
}

# Function to run frontend tests
run_frontend_tests() {
    echo -e "${BLUE}=== Running Frontend Tests ===${NC}"
    
    if [ ! -d "frontend" ]; then
        echo -e "${YELLOW}Warning: frontend directory not found. Skipping frontend tests${NC}"
        return 1
    fi
    
    if [ ! -d "frontend/node_modules" ]; then
        echo -e "${YELLOW}Warning: node_modules not found. Skipping frontend tests${NC}"
        return 1
    fi
    
    cd frontend
    
    # Check if vitest is installed
    if ! npm list vitest &>/dev/null; then
        echo -e "${YELLOW}Warning: vitest not installed. Skipping frontend tests${NC}"
        cd ..
        return 1
    fi
    
    # Run vitest if test files exist
    if find src -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" 2>/dev/null | grep -q .; then
        npm run test -- --run || EXIT_CODE=1
    else
        echo -e "${YELLOW}No test files found in frontend/src/${NC}"
    fi
    
    cd ..
    echo ""
}

# Function to run linting
run_linting() {
    echo -e "${BLUE}=== Running Linting ===${NC}"
    
    # Backend linting
    if [ -d "venv" ] && [ -f "backend/main.py" ]; then
        echo -e "${CYAN}Backend linting...${NC}"
        source venv/bin/activate
        
        # Check for flake8
        if command -v flake8 &>/dev/null || python -m flake8 --version &>/dev/null; then
            python -m flake8 backend/ --max-line-length=100 --ignore=E203,W503 || EXIT_CODE=1
        else
            echo -e "${YELLOW}flake8 not installed. Skipping Python linting${NC}"
        fi
        
        # Check for black (format check)
        if command -v black &>/dev/null || python -m black --version &>/dev/null; then
            python -m black --check backend/ || EXIT_CODE=1
        else
            echo -e "${YELLOW}black not installed. Skipping Python formatting check${NC}"
        fi
        
        deactivate
    fi
    
    # Frontend linting
    if [ -d "frontend" ] && [ -d "frontend/node_modules" ]; then
        echo -e "${CYAN}Frontend linting...${NC}"
        cd frontend
        
        # Check if eslint is installed
        if npm list eslint &>/dev/null; then
            npm run lint || EXIT_CODE=1
        else
            echo -e "${YELLOW}eslint not installed. Skipping frontend linting${NC}"
        fi
        
        cd ..
    fi
    
    echo ""
}

# Function to run type checking
run_type_check() {
    echo -e "${BLUE}=== Running Type Checking ===${NC}"
    
    # Backend type checking (mypy)
    if [ -d "venv" ] && [ -f "backend/main.py" ]; then
        echo -e "${CYAN}Backend type checking...${NC}"
        source venv/bin/activate
        
        if command -v mypy &>/dev/null || python -m mypy --version &>/dev/null; then
            python -m mypy backend/ --ignore-missing-imports || EXIT_CODE=1
        else
            echo -e "${YELLOW}mypy not installed. Skipping Python type checking${NC}"
        fi
        
        deactivate
    fi
    
    # Frontend type checking (TypeScript)
    if [ -d "frontend" ] && [ -d "frontend/node_modules" ]; then
        echo -e "${CYAN}Frontend type checking...${NC}"
        cd frontend
        
        # Check if TypeScript is installed
        if npm list typescript &>/dev/null; then
            npx tsc --noEmit || EXIT_CODE=1
        else
            echo -e "${YELLOW}TypeScript not installed. Skipping frontend type checking${NC}"
        fi
        
        cd ..
    fi
    
    echo ""
}

# Function to run API integration tests
run_api_tests() {
    echo -e "${BLUE}=== Running API Integration Tests ===${NC}"
    
    # Check if backend is running
    if ! curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
        echo -e "${YELLOW}Warning: Backend not running on port 8000. Skipping API tests${NC}"
        echo -e "${YELLOW}  Start backend with: ./run.sh backend${NC}"
        return 1
    fi
    
    echo -e "${CYAN}Testing /api/health...${NC}"
    HEALTH_RESPONSE=$(curl -s http://localhost:8000/api/health)
    if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
        echo -e "${GREEN}✓ Health endpoint working${NC}"
    else
        echo -e "${RED}✗ Health endpoint failed${NC}"
        EXIT_CODE=1
    fi
    
    echo -e "${CYAN}Testing /api/scan/quick...${NC}"
    QUICK_RESPONSE=$(curl -s http://localhost:8000/api/scan/quick)
    if echo "$QUICK_RESPONSE" | grep -q '"overview"'; then
        echo -e "${GREEN}✓ Quick scan endpoint working${NC}"
        # Extract folder count
        FOLDER_COUNT=$(echo "$QUICK_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('top_folders', [])))" 2>/dev/null || echo "?")
        echo -e "${CYAN}  Found ${FOLDER_COUNT} top-level folders${NC}"
    else
        echo -e "${RED}✗ Quick scan endpoint failed${NC}"
        echo -e "${YELLOW}  Response: ${QUICK_RESPONSE:0:200}...${NC}"
        EXIT_CODE=1
    fi
    
    echo -e "${CYAN}Testing /api/scan/full/start...${NC}"
    START_RESPONSE=$(curl -s -X POST http://localhost:8000/api/scan/full/start)
    if echo "$START_RESPONSE" | grep -q '"scan_id"'; then
        echo -e "${GREEN}✓ Full scan start endpoint working${NC}"
        SCAN_ID=$(echo "$START_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['scan_id'])" 2>/dev/null)
        if [ -n "$SCAN_ID" ]; then
            echo -e "${CYAN}  Started scan: ${SCAN_ID:0:8}...${NC}"
            
            # Test status endpoint
            echo -e "${CYAN}Testing /api/scan/full/status/{scan_id}...${NC}"
            sleep 1  # Give scan a moment to start
            STATUS_RESPONSE=$(curl -s "http://localhost:8000/api/scan/full/status/$SCAN_ID")
            if echo "$STATUS_RESPONSE" | grep -q '"status"'; then
                echo -e "${GREEN}✓ Status endpoint working${NC}"
                STATUS=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "unknown")
                PROGRESS=$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('progress', {}).get('progress', 0))" 2>/dev/null || echo "0")
                echo -e "${CYAN}  Scan status: ${STATUS}, Progress: ${PROGRESS}%${NC}"
            else
                echo -e "${RED}✗ Status endpoint failed${NC}"
                EXIT_CODE=1
            fi
        fi
    else
        echo -e "${RED}✗ Full scan start endpoint failed${NC}"
        echo -e "${YELLOW}  Response: ${START_RESPONSE:0:200}...${NC}"
        EXIT_CODE=1
    fi
    
    echo ""
}

# Main logic
MODE=${1:-all}

case $MODE in
    backend)
        run_backend_tests
        ;;
    frontend)
        run_frontend_tests
        ;;
    lint)
        run_linting
        ;;
    type-check)
        run_type_check
        ;;
    api)
        run_api_tests
        ;;
    all|*)
        run_backend_tests || true
        run_frontend_tests || true
        run_linting || true
        run_type_check || true
        run_api_tests || true
        ;;
esac

# Summary
echo -e "${BLUE}=== Test Summary ===${NC}"
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
else
    echo -e "${RED}Some checks failed${NC}"
fi

exit $EXIT_CODE

