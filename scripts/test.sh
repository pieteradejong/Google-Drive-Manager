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
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
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
            # Use config file if it exists, otherwise use inline options
            if [ -f "backend/.flake8" ]; then
                python -m flake8 backend/ --config=backend/.flake8 || EXIT_CODE=1
            else
                python -m flake8 backend/ --max-line-length=100 --ignore=E203,W503 || EXIT_CODE=1
            fi
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
            # Use config file if it exists
            if [ -f "backend/mypy.ini" ]; then
                python -m mypy backend/ --config-file=backend/mypy.ini || EXIT_CODE=1
            else
                python -m mypy backend/ --ignore-missing-imports || EXIT_CODE=1
            fi
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
        
        # Test cache - run again and verify it's fast (cached)
        echo -e "${CYAN}Testing quick scan cache...${NC}"
        START_TIME=$(date +%s%N)
        QUICK_RESPONSE2=$(curl -s http://localhost:8000/api/scan/quick)
        END_TIME=$(date +%s%N)
        DURATION=$(( (END_TIME - START_TIME) / 1000000 )) # Convert to milliseconds
        
        if echo "$QUICK_RESPONSE2" | grep -q '"overview"'; then
            if [ $DURATION -lt 1000 ]; then
                echo -e "${GREEN}✓ Quick scan cache working (${DURATION}ms - likely cached)${NC}"
            else
                echo -e "${YELLOW}⚠ Quick scan took ${DURATION}ms (may not be cached)${NC}"
            fi
        else
            echo -e "${RED}✗ Quick scan cache test failed${NC}"
            EXIT_CODE=1
        fi
    else
        echo -e "${RED}✗ Quick scan endpoint failed${NC}"
        echo -e "${YELLOW}  Response: ${QUICK_RESPONSE:0:200}...${NC}"
        EXIT_CODE=1
    fi
    
    echo -e "${CYAN}Testing /api/scan/full/cache/status...${NC}"
    STATUS_START_TIME=$(date +%s%N)
    FULL_CACHE_STATUS=$(curl -s http://localhost:8000/api/scan/full/cache/status)
    STATUS_END_TIME=$(date +%s%N)
    STATUS_DURATION=$(( (STATUS_END_TIME - STATUS_START_TIME) / 1000000 )) # Convert to milliseconds
    
    # Validate JSON shape includes exists + valid
    if echo "$FULL_CACHE_STATUS" | grep -q '"exists"' && echo "$FULL_CACHE_STATUS" | grep -q '"valid"'; then
        echo -e "${GREEN}✓ Full scan cache status endpoint working (${STATUS_DURATION}ms)${NC}"
        FULL_CACHE_EXISTS=$(echo "$FULL_CACHE_STATUS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('exists'))" 2>/dev/null || echo "unknown")
        FULL_CACHE_VALID=$(echo "$FULL_CACHE_STATUS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('valid'))" 2>/dev/null || echo "unknown")
        FULL_CACHE_REASON=$(echo "$FULL_CACHE_STATUS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('reason') or '')" 2>/dev/null || echo "")
        FULL_CACHE_TS=$(echo "$FULL_CACHE_STATUS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('timestamp') or '')" 2>/dev/null || echo "")
        echo -e "${CYAN}  exists=${FULL_CACHE_EXISTS}, valid=${FULL_CACHE_VALID}, reason=${FULL_CACHE_REASON} ${FULL_CACHE_TS:+, timestamp=${FULL_CACHE_TS}}${NC}"
        
        # Verify it's fast (should be < 100ms for sidecar-only check)
        if [ $STATUS_DURATION -lt 100 ]; then
            echo -e "${GREEN}  ✓ Status check is fast (sidecar-only, no Drive API call)${NC}"
        else
            echo -e "${YELLOW}  ⚠ Status check took ${STATUS_DURATION}ms (may be slower than expected)${NC}"
        fi
        
        # Test validate endpoint if cache exists
        if [ "$FULL_CACHE_EXISTS" = "True" ]; then
            echo -e "${CYAN}Testing /api/scan/full/cache/validate...${NC}"
            VALIDATE_START_TIME=$(date +%s%N)
            FULL_CACHE_VALIDATE=$(curl -s http://localhost:8000/api/scan/full/cache/validate)
            VALIDATE_END_TIME=$(date +%s%N)
            VALIDATE_DURATION=$(( (VALIDATE_END_TIME - VALIDATE_START_TIME) / 1000000 )) # Convert to milliseconds
            
            if echo "$FULL_CACHE_VALIDATE" | grep -q '"exists"' && echo "$FULL_CACHE_VALIDATE" | grep -q '"valid"'; then
                echo -e "${GREEN}✓ Full scan cache validate endpoint working (${VALIDATE_DURATION}ms)${NC}"
                VALIDATE_VALID=$(echo "$FULL_CACHE_VALIDATE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('valid'))" 2>/dev/null || echo "unknown")
                VALIDATE_REASON=$(echo "$FULL_CACHE_VALIDATE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('reason') or '')" 2>/dev/null || echo "")
                echo -e "${CYAN}  Drive validation: valid=${VALIDATE_VALID}, reason=${VALIDATE_REASON}${NC}"
            else
                echo -e "${RED}✗ Full scan cache validate endpoint failed${NC}"
                echo -e "${YELLOW}  Response: ${FULL_CACHE_VALIDATE:0:200}...${NC}"
                EXIT_CODE=1
            fi
        fi
    else
        echo -e "${RED}✗ Full scan cache status endpoint failed${NC}"
        echo -e "${YELLOW}  Response: ${FULL_CACHE_STATUS:0:200}...${NC}"
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
                
                # Test cache - if status is immediately complete, it's from cache
                if [ "$STATUS" = "complete" ] && [ "$(echo "$STATUS_RESPONSE" | python3 -c "import sys, json; print('cache' in json.load(sys.stdin).get('progress', {}).get('message', '').lower())" 2>/dev/null || echo 'False')" = "True" ]; then
                    echo -e "${GREEN}✓ Full scan cache working (returned immediately from cache)${NC}"
                fi
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
    
    # Test cache invalidation endpoint
    echo -e "${CYAN}Testing /api/cache (DELETE)...${NC}"
    DELETE_RESPONSE=$(curl -s -X DELETE http://localhost:8000/api/cache)
    if echo "$DELETE_RESPONSE" | grep -q '"message"'; then
        echo -e "${GREEN}✓ Cache invalidation endpoint working${NC}"
    else
        echo -e "${YELLOW}⚠ Cache invalidation endpoint may not be working${NC}"
    fi
    
    echo ""
}

# Function to run visualization safety tests
run_visualization_tests() {
    echo -e "${BLUE}=== Running Visualization Safety Tests ===${NC}"
    
    if [ ! -d "venv" ]; then
        echo -e "${YELLOW}Warning: Virtual environment not found. Skipping visualization tests${NC}"
        return 1
    fi
    
    if [ ! -f "backend/main.py" ]; then
        echo -e "${YELLOW}Warning: backend/main.py not found. Skipping visualization tests${NC}"
        return 1
    fi
    
    source venv/bin/activate
    
    # Run visualization safety tests
    if [ -f "backend/tests/test_visualization_safety.py" ]; then
        python -m pytest backend/tests/test_visualization_safety.py -v --tb=short -m "visualization" || EXIT_CODE=1
    else
        echo -e "${YELLOW}No visualization safety tests found${NC}"
    fi
    
    deactivate
    echo ""
}

# Function to run cache loading tests
run_cache_tests() {
    echo -e "${BLUE}=== Running Cache Loading Tests ===${NC}"
    
    if [ ! -d "venv" ]; then
        echo -e "${YELLOW}Warning: Virtual environment not found. Skipping cache tests${NC}"
        return 1
    fi
    
    if [ ! -f "backend/main.py" ]; then
        echo -e "${YELLOW}Warning: backend/main.py not found. Skipping cache tests${NC}"
        return 1
    fi
    
    source venv/bin/activate
    
    # Run cache loading tests
    if [ -f "backend/tests/test_cache_loading.py" ]; then
        python -m pytest backend/tests/test_cache_loading.py -v --tb=short -m "cache" || EXIT_CODE=1
    else
        echo -e "${YELLOW}No cache loading tests found${NC}"
    fi
    
    # Run all cache tests
    if find backend/tests -name "test_cache*.py" 2>/dev/null | grep -q .; then
        python -m pytest backend/tests/test_cache*.py -v --tb=short || EXIT_CODE=1
    fi
    
    deactivate
    echo ""
}

# Function to run DAG and ownership tests
run_dag_tests() {
    echo -e "${BLUE}=== Running DAG & Ownership Tests ===${NC}"
    
    # Backend DAG tests
    if [ -d "venv" ] && [ -f "backend/main.py" ]; then
        echo -e "${CYAN}Backend DAG integration tests...${NC}"
        source venv/bin/activate
        
        if [ -f "backend/tests/test_dag_root_integration.py" ]; then
            python -m pytest backend/tests/test_dag_root_integration.py -v --tb=short || EXIT_CODE=1
        else
            echo -e "${YELLOW}No backend DAG tests found${NC}"
        fi
        
        deactivate
    fi
    
    # Frontend DAG tests
    if [ -d "frontend" ] && [ -d "frontend/node_modules" ]; then
        echo -e "${CYAN}Frontend DAG unit tests...${NC}"
        cd frontend
        
        if [ -f "src/utils/__tests__/driveDag.test.ts" ]; then
            npm run test -- --run src/utils/__tests__/driveDag.test.ts || EXIT_CODE=1
        else
            echo -e "${YELLOW}No frontend DAG tests found${NC}"
        fi
        
        cd ..
    fi
    
    echo ""
}

# Function to run logger/logging tests
run_logger_tests() {
    echo -e "${BLUE}=== Running Logger Tests ===${NC}"
    
    # Frontend logger tests
    if [ -d "frontend" ] && [ -d "frontend/node_modules" ]; then
        echo -e "${CYAN}Frontend logger unit tests...${NC}"
        cd frontend
        
        if [ -f "src/utils/__tests__/logger.test.ts" ]; then
            npm run test -- --run src/utils/__tests__/logger.test.ts || EXIT_CODE=1
        else
            echo -e "${YELLOW}No frontend logger tests found${NC}"
        fi
        
        cd ..
    fi
    
    # Backend logging tests (auth.py logging, etc.)
    if [ -d "venv" ] && [ -f "backend/main.py" ]; then
        echo -e "${CYAN}Backend auth tests (includes logging)...${NC}"
        source venv/bin/activate
        
        if [ -f "backend/tests/test_auth.py" ]; then
            python -m pytest backend/tests/test_auth.py -v --tb=short || EXIT_CODE=1
        else
            echo -e "${YELLOW}No backend auth tests found${NC}"
        fi
        
        deactivate
    fi
    
    echo ""
}

# Print help message
print_help() {
    echo -e "${BLUE}Google Drive Manager Test Suite${NC}"
    echo ""
    echo "Usage: $0 [mode]"
    echo ""
    echo "Available modes:"
    echo "  all           Run all tests (default)"
    echo "  backend       Run backend Python tests"
    echo "  frontend      Run frontend TypeScript/React tests"
    echo "  lint          Run linting (flake8, black, eslint)"
    echo "  type-check    Run type checking (mypy, tsc)"
    echo "  api           Run API integration tests (requires running backend)"
    echo "  visualization Run visualization safety tests"
    echo "  cache         Run cache loading tests"
    echo "  dag           Run DAG & ownership tests"
    echo "  logger        Run logger utility tests"
    echo "  help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0              # Run all tests"
    echo "  $0 backend      # Run only backend tests"
    echo "  $0 frontend     # Run only frontend tests"
    echo "  $0 logger       # Run only logger tests"
}

# Main logic
MODE=${1:-all}

case $MODE in
    help|-h|--help)
        print_help
        exit 0
        ;;
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
    visualization)
        run_visualization_tests
        ;;
    cache)
        run_cache_tests
        ;;
    dag)
        run_dag_tests
        ;;
    logger)
        run_logger_tests
        ;;
    all|*)
        run_backend_tests || true
        run_frontend_tests || true
        run_linting || true
        run_type_check || true
        run_api_tests || true
        run_visualization_tests || true
        run_cache_tests || true
        run_dag_tests || true
        run_logger_tests || true
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

