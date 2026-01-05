#!/bin/bash

echo "🧪 Testing Realm Assignment Functionality"
echo "========================================="

# Test 1: Check current realms
echo -e "\n📋 Available Realms:"
curl -s http://localhost:3000/api/realms | jq -r '.data[] | "- \(.name) (\(.id))"'

# Test 2: Check current agents and their realm assignments
echo -e "\n👥 Current Agent Realm Assignments:"
curl -s http://localhost:3000/api/agents | jq -r '.[] | "- \(.name) (\(.type)): \(.realmAccess.boundRealmId // "no realm") / accessible: \(.realmAccess.accessibleRealms // [])"'

# Test 3: Update Tolkien (elemental) to Newford realm
echo -e "\n🧙 Testing Elemental Realm Assignment (Tolkien → Newford)..."
NEWFORD_ID=$(curl -s http://localhost:3000/api/realms | jq -r '.data[] | select(.name=="Newford") | .id')
echo "Newford realm ID: $NEWFORD_ID"

curl -X PUT http://localhost:3000/api/agents/tolkien \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Tolkien\",
    \"type\": \"elemental\", 
    \"description\": \"Fantasy literature specialist\",
    \"realmAccess\": {
      \"boundRealmId\": \"$NEWFORD_ID\"
    }
  }" > /dev/null

# Verify the assignment
echo "✅ Tolkien realm assignment:"
curl -s http://localhost:3000/api/agents/tolkien | jq '{name, type, boundRealm: .realmAccess.boundRealmId}'

# Test 4: Update Colleen (druid) to access both realms
echo -e "\n🌟 Testing Druid Multiple Realm Access (Colleen → Both Realms)..."
MIDDLE_EARTH_ID=$(curl -s http://localhost:3000/api/realms | jq -r '.data[] | select(.name=="Middle Earth") | .id')
echo "Middle Earth realm ID: $MIDDLE_EARTH_ID"

curl -X PUT http://localhost:3000/api/agents/colleen \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Colleen\",
    \"type\": \"druid\", 
    \"description\": \"Coordination specialist\",
    \"realmAccess\": {
      \"accessibleRealms\": [\"$MIDDLE_EARTH_ID\", \"$NEWFORD_ID\"],
      \"boundRealmId\": \"default\"
    }
  }" > /dev/null

# Verify the assignment
echo "✅ Colleen realm assignment:"
curl -s http://localhost:3000/api/agents/colleen | jq '{name, type, boundRealm: .realmAccess.boundRealmId, accessibleRealms: .realmAccess.accessibleRealms}'

# Test 5: Clear realm assignment (De Lint)
echo -e "\n🧹 Testing Realm Assignment Clearing (De Lint → No Realm)..."
curl -X PUT http://localhost:3000/api/agents/de-lint \
  -H "Content-Type: application/json" \
  -d '{
    "name": "De Lint",
    "type": "elemental", 
    "description": "Urban fantasy specialist",
    "realmAccess": {
      "boundRealmId": ""
    }
  }' > /dev/null

# Verify the clearing
echo "✅ De Lint realm assignment (should be empty):"
curl -s http://localhost:3000/api/agents/de-lint | jq '{name, type, boundRealm: .realmAccess.boundRealmId}'

echo -e "\n🎉 Realm Assignment Tests Complete!"
echo "You can now test the UI at http://localhost:3004"