#!/bin/bash

# Concurrent Session Architecture Regression Test
# This test ensures that the concurrent session support cannot be regressed

echo "🛡️ Concurrent Session Architecture Regression Test"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
PASSED=0
FAILED=0

# Function to print test result
print_result() {
  local test_name="$1"
  local result="$2"
  local details="$3"
  
  if [[ "$result" == "PASS" ]]; then
    echo -e "  ✅ ${GREEN}$test_name${NC}: $details"
    ((PASSED++))
  else
    echo -e "  ❌ ${RED}$test_name${NC}: $details"
    ((FAILED++))
  fi
}

echo ""
echo "🔍 Testing Session Isolation Architecture..."

# Test 1: Check for session-scoped manager files
echo ""
echo "📁 Test 1: Verifying session manager files exist"

if [[ -f "src/models/SessionAgentState.ts" ]]; then
  print_result "SessionAgentState" "PASS" "Session agent state interfaces found"
else
  print_result "SessionAgentState" "FAIL" "Session agent state interfaces missing"
fi

if [[ -f "src/models/TaskQueueState.ts" ]]; then
  print_result "TaskQueueState" "PASS" "Task queue state interfaces found"
else
  print_result "TaskQueueState" "FAIL" "Task queue state interfaces missing"
fi

if [[ -f "src/models/SessionContentState.ts" ]]; then
  print_result "SessionContentState" "PASS" "Session content state interfaces found"
else
  print_result "SessionContentState" "FAIL" "Session content state interfaces missing"
fi

if [[ -f "src/models/CoordinatorSessionState.ts" ]]; then
  print_result "CoordinatorSessionState" "PASS" "Coordinator session state interfaces found"
else
  print_result "CoordinatorSessionState" "FAIL" "Coordinator session state interfaces missing"
fi

# Test 2: Check for session manager implementations
echo ""
echo "🔧 Test 2: Verifying session manager implementations"

if [[ -f "src/services/SessionAgentManager.ts" ]]; then
  print_result "SessionAgentManager" "PASS" "Session agent manager implementation found"
else
  print_result "SessionAgentManager" "FAIL" "Session agent manager implementation missing"
fi

if [[ -f "src/services/TaskQueueManager.ts" ]]; then
  print_result "TaskQueueManager" "PASS" "Task queue manager implementation found"
else
  print_result "TaskQueueManager" "FAIL" "Task queue manager implementation missing"
fi

if [[ -f "src/services/SessionContentManager.ts" ]]; then
  print_result "SessionContentManager" "PASS" "Session content manager implementation found"
else
  print_result "SessionContentManager" "FAIL" "Session content manager implementation missing"
fi

if [[ -f "src/services/CoordinatorConcurrencyManager.ts" ]]; then
  print_result "CoordinatorConcurrencyManager" "PASS" "Coordinator concurrency manager implementation found"
else
  print_result "CoordinatorConcurrencyManager" "FAIL" "Coordinator concurrency manager implementation missing"
fi

# Test 3: Check CoordinationService integration
echo ""
echo "🔗 Test 3: Verifying CoordinationService integration"

if grep -q "SessionAgentManagerImpl" src/services/CoordinationService.ts; then
  print_result "SessionAgentManagerImpl Integration" "PASS" "Found in CoordinationService"
else
  print_result "SessionAgentManagerImpl Integration" "FAIL" "Missing from CoordinationService"
fi

if grep -q "SessionContentManagerImpl" src/services/CoordinationService.ts; then
  print_result "SessionContentManagerImpl Integration" "PASS" "Found in CoordinationService"
else
  print_result "SessionContentManagerImpl Integration" "FAIL" "Missing from CoordinationService"
fi

if grep -q "CoordinatorConcurrencyManagerImpl" src/services/CoordinationService.ts; then
  print_result "CoordinatorConcurrencyManagerImpl Integration" "PASS" "Found in CoordinationService"
else
  print_result "CoordinatorConcurrencyManagerImpl Integration" "FAIL" "Missing from CoordinationService"
fi

# Test 4: Check for session isolation patterns
echo ""
echo "🔒 Test 4: Verifying session isolation patterns"

if grep -q "canStartSession" src/services/CoordinationService.ts; then
  print_result "Concurrency Check Pattern" "PASS" "Found session limit checking"
else
  print_result "Concurrency Check Pattern" "FAIL" "Missing session limit checking"
fi

if grep -A3 "startSession" src/services/CoordinationService.ts | grep -q "coordinatorId"; then
  print_result "Session Registration Pattern" "PASS" "Found session registration"
else
  print_result "Session Registration Pattern" "FAIL" "Missing session registration"
fi

if grep -q "updateSessionActivity" src/services/CoordinationService.ts; then
  print_result "Activity Tracking Pattern" "PASS" "Found session activity tracking"
else
  print_result "Activity Tracking Pattern" "FAIL" "Missing session activity tracking"
fi

if grep -q "endSession" src/services/CoordinationService.ts; then
  print_result "Session Cleanup Pattern" "PASS" "Found session cleanup"
else
  print_result "Session Cleanup Pattern" "FAIL" "Missing session cleanup"
fi

# Test 5: Check for forbidden patterns
echo ""
echo "🚫 Test 5: Checking for forbidden patterns"

# Check for global agent state storage in AgentService
if grep -q "private.*agentStates.*Map" src/services/AgentService.ts; then
  print_result "Global Agent State Check" "FAIL" "Found forbidden global agent state"
else
  print_result "Global Agent State Check" "PASS" "No global agent state found"
fi

# Check for session data in service classes
if grep -q "currentSession" src/services/CoordinationService.ts; then
  print_result "Session Data in Service Check" "FAIL" "Found forbidden session data in service"
else
  print_result "Session Data in Service Check" "PASS" "No session data in service classes"
fi

# Test 6: Constitution file exists
echo ""
echo "📜 Test 6: Verifying constitutional protection"

if [[ -f "CONCURRENT_SESSION_CONSTITUTION.md" ]]; then
  print_result "Constitution File" "PASS" "Constitutional protection document exists"
else
  print_result "Constitution File" "FAIL" "Constitutional protection document missing"
fi

# Test 7: TypeScript compilation
echo ""
echo "🔨 Test 7: TypeScript compilation check"

if npm run build >/dev/null 2>&1; then
  print_result "TypeScript Compilation" "PASS" "All session managers compile successfully"
else
  print_result "TypeScript Compilation" "FAIL" "Compilation errors detected"
fi

# Summary
echo ""
echo "📊 Test Summary"
echo "==============="
echo -e "✅ Passed: ${GREEN}$PASSED${NC}"
echo -e "❌ Failed: ${RED}$FAILED${NC}"

if [[ $FAILED -eq 0 ]]; then
  echo ""
  echo -e "🎉 ${GREEN}ALL TESTS PASSED${NC}"
  echo -e "🛡️ Concurrent session architecture is ${GREEN}PROTECTED${NC}"
  exit 0
else
  echo ""
  echo -e "💥 ${RED}TESTS FAILED${NC}"
  echo -e "⚠️ Concurrent session architecture may be ${RED}COMPROMISED${NC}"
  echo ""
  echo "🚨 EMERGENCY PROTOCOL REQUIRED:"
  echo "1. Review failed tests above"
  echo "2. Check CONCURRENT_SESSION_CONSTITUTION.md"
  echo "3. Restore missing session isolation components"
  echo "4. Re-run this test until all pass"
  exit 1
fi