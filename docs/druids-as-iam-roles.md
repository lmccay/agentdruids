# Druids as IAM Roles: User Authorization Model

## Core Concept

**Druids function like IAM Roles that authenticated users can assume.**

Users don't have direct realm permissions. Instead:
1. Users are granted access to specific **druids** (like being allowed to assume IAM roles)
2. Each druid has **realm access** and **capabilities** (like role policies)
3. Users inherit realm access **implicitly** through the druids they can use
4. Users can assume **multiple druids simultaneously** in a single session (like assuming multiple roles)

## Architecture

### Permission Flow

```
┌─────────────────────────────────────────────────────┐
│ User: alice@company.com                             │
│ Groups: [engineering, security-reviewers]           │
└──────────────────┬──────────────────────────────────┘
                   │ is granted access to
                   ↓
┌─────────────────────────────────────────────────────┐
│ Allowed Druids (like IAM roles):                    │
│  - engineering-druid-1                              │
│  - security-druid-1                                 │
│  - data-quality-druid                               │
└──────────────────┬──────────────────────────────────┘
                   │ each druid has
                   ↓
┌─────────────────────────────────────────────────────┐
│ Druid: engineering-druid-1                          │
│  Realm Access:                                      │
│   - engineering realm (read, write, execute)        │
│   - aws realm (read, execute)                       │
│  Capabilities:                                      │
│   - Code review, PR management                      │
│   - Infrastructure deployment                       │
│   - CI/CD orchestration                             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Druid: security-druid-1                             │
│  Realm Access:                                      │
│   - engineering realm (read, audit)                 │
│   - security realm (read, write, execute)           │
│   - compliance realm (read)                         │
│  Capabilities:                                      │
│   - Vulnerability scanning                          │
│   - Security auditing                               │
│   - Compliance checking                             │
└─────────────────────────────────────────────────────┘

Therefore, alice@company.com has IMPLICIT access to:
  - engineering realm (via both druids)
  - aws realm (via engineering-druid-1)
  - security realm (via security-druid-1)
  - compliance realm (via security-druid-1)
```

### Comparison to AWS IAM

| AWS IAM | Druids |
|---------|--------|
| User | Authenticated User |
| IAM Role | Druid Agent |
| Role Policy | Druid's realmAccess + capabilities |
| AssumeRole | Include druid in session |
| Multiple roles (via chaining) | Multiple druids in single session |
| Role Session | Coordination Session |
| Role ARN | Druid ID |
| iam:ListRoles | GET /api/user/me/available-druids |
| iam:GetRolePolicy | GET /api/agents/{druidId}/capabilities |

## User Authentication & Session Flow

### 1. Authentication

```
User → SSO/OAuth Login → Druids Auth Service
  ↓
Session Established:
{
  sessionId: "sess-abc-123",
  userId: "alice@company.com",
  groups: ["engineering", "security-reviewers"],
  authenticatedAt: "2025-01-01T10:00:00Z",
  expiresAt: "2025-01-01T18:00:00Z",
  masterToken: "eyJhbGc..." // JWT with user claims
}
```

### 2. Druid Discovery

User queries: **"What druids can I use?"**

```
GET /api/user/me/available-druids

Response:
{
  "userId": "alice@company.com",
  "availableDruids": [
    {
      "druidId": "engineering-druid-1",
      "name": "Engineering Coordinator",
      "description": "Orchestrates engineering workflows: code review, deployment, CI/CD",
      "realmAccess": [
        {
          "realmId": "engineering",
          "permissions": ["read", "write", "execute"],
          "description": "Full access to engineering realm"
        },
        {
          "realmId": "aws",
          "permissions": ["read", "execute"],
          "description": "Read and execute in AWS realm (no destructive ops)"
        }
      ],
      "capabilities": [
        "Code review and analysis",
        "Pull request management",
        "CI/CD orchestration",
        "Infrastructure deployment (non-production)"
      ],
      "maxConcurrentSessions": 3
    },
    {
      "druidId": "security-druid-1",
      "name": "Security Auditor",
      "description": "Performs security audits across engineering and compliance",
      "realmAccess": [
        {
          "realmId": "engineering",
          "permissions": ["read", "audit"],
          "description": "Read-only access for security scanning"
        },
        {
          "realmId": "security",
          "permissions": ["read", "write", "execute"],
          "description": "Full access to security tools"
        },
        {
          "realmId": "compliance",
          "permissions": ["read"],
          "description": "Read compliance policies"
        }
      ],
      "capabilities": [
        "Vulnerability scanning",
        "Security policy auditing",
        "Compliance checking",
        "Incident investigation"
      ],
      "maxConcurrentSessions": 1
    },
    {
      "druidId": "data-quality-druid",
      "name": "Data Quality Analyst",
      "description": "Monitors and analyzes data pipeline quality",
      "realmAccess": [
        {
          "realmId": "data",
          "permissions": ["read", "execute"],
          "description": "Access to data pipelines and quality tools"
        }
      ],
      "capabilities": [
        "Data quality monitoring",
        "Pipeline health checks",
        "Schema validation"
      ],
      "maxConcurrentSessions": 5
    }
  ],
  "effectiveRealmAccess": {
    "engineering": {
      "granted": true,
      "via": ["engineering-druid-1", "security-druid-1"],
      "highestPermissions": ["read", "write", "execute"]
    },
    "aws": {
      "granted": true,
      "via": ["engineering-druid-1"],
      "highestPermissions": ["read", "execute"]
    },
    "security": {
      "granted": true,
      "via": ["security-druid-1"],
      "highestPermissions": ["read", "write", "execute"]
    },
    "compliance": {
      "granted": true,
      "via": ["security-druid-1"],
      "highestPermissions": ["read"]
    },
    "data": {
      "granted": true,
      "via": ["data-quality-druid"],
      "highestPermissions": ["read", "execute"]
    }
  }
}
```

### 3. Druid Details

User queries: **"What can this specific druid do?"**

```
GET /api/agents/engineering-druid-1/capabilities

Response:
{
  "druidId": "engineering-druid-1",
  "type": "druid",
  "name": "Engineering Coordinator",
  "description": "Orchestrates engineering workflows",

  "realmAccess": {
    "allowRealmTravel": true,
    "accessibleRealms": [
      {
        "realmId": "engineering",
        "realmName": "Engineering Realm",
        "permissions": ["read", "write", "execute"],
        "availableElementals": [
          "github-elemental",
          "cicd-elemental",
          "code-quality-elemental",
          "engineering-security-elemental"
        ]
      },
      {
        "realmId": "aws",
        "realmName": "AWS Infrastructure Realm",
        "permissions": ["read", "execute"],
        "availableElementals": [
          "ec2-elemental",
          "s3-elemental",
          "lambda-elemental"
        ],
        "restrictions": [
          "No production deployments",
          "No destructive operations (delete, terminate)"
        ]
      }
    ]
  },

  "capabilities": {
    "primary": [
      "Code review orchestration",
      "Pull request management",
      "CI/CD pipeline orchestration",
      "Infrastructure deployment (non-production)"
    ],
    "secondary": [
      "Code quality analysis",
      "Security scanning coordination",
      "Documentation generation"
    ]
  },

  "toolAccess": {
    "github": {
      "operations": ["read", "write", "review"],
      "restrictions": ["no-force-push", "no-branch-deletion"]
    },
    "aws": {
      "operations": ["read", "execute"],
      "restrictions": ["dev-accounts-only", "no-production-access"]
    },
    "slack": {
      "operations": ["read", "write"],
      "restrictions": ["engineering-channels-only"]
    }
  },

  "limitations": {
    "maxConcurrentSessions": 3,
    "sessionTimeout": 3600, // seconds
    "rateLimit": {
      "maxTasksPerHour": 100,
      "maxRealmTransitionsPerSession": 20
    }
  }
}
```

### 4. Session Initiation with Druids

User selects druid(s) and initiates coordination:

```
POST /api/coordination/sessions

Request:
{
  "scenarioId": "code-review-and-deploy",
  "druids": [
    {
      "druidId": "engineering-druid-1",
      "role": "primary-coordinator" // This druid orchestrates
    },
    {
      "druidId": "security-druid-1",
      "role": "security-reviewer" // This druid handles security checks
    }
  ],
  "parameters": {
    "repository": "company/backend-api",
    "prNumber": 123,
    "deployTarget": "dev"
  }
}

Response:
{
  "sessionId": "coord-session-xyz-789",
  "userId": "alice@company.com",
  "activeDruids": [
    {
      "druidId": "engineering-druid-1",
      "role": "primary-coordinator",
      "status": "active",
      "currentRealm": null // Coordinator is global
    },
    {
      "druidId": "security-druid-1",
      "role": "security-reviewer",
      "status": "active",
      "currentRealm": null
    }
  ],
  "effectivePermissions": {
    // Union of permissions from both druids
    "realms": ["engineering", "aws", "security", "compliance"],
    "operations": {
      "engineering": ["read", "write", "execute", "audit"],
      "aws": ["read", "execute"],
      "security": ["read", "write", "execute"],
      "compliance": ["read"]
    }
  },
  "sessionStartedAt": "2025-01-01T10:05:00Z",
  "sessionExpiresAt": "2025-01-01T11:05:00Z"
}
```

### 5. Audit Trail

All actions logged with user identity and assumed druids:

```
Audit Log Entry:
{
  "timestamp": "2025-01-01T10:06:32Z",
  "userId": "alice@company.com",
  "sessionId": "coord-session-xyz-789",
  "assumedDruid": "engineering-druid-1",
  "action": "delegation",
  "details": {
    "targetAgent": "github-elemental",
    "task": "Review PR #123",
    "realm": "engineering"
  },
  "result": "success"
}

Audit Log Entry:
{
  "timestamp": "2025-01-01T10:07:15Z",
  "userId": "alice@company.com",
  "sessionId": "coord-session-xyz-789",
  "assumedDruid": "engineering-druid-1",
  "actingAsElemental": "github-elemental",
  "action": "mcp-tool-call",
  "details": {
    "tool": "github",
    "method": "add_review_comment",
    "params": { "prNumber": 123, "comment": "LGTM" }
  },
  "result": "success",
  "note": "Action performed on behalf of alice@company.com via engineering-druid-1"
}
```

## User-to-Druid Mapping

### Storage Model

```typescript
// User Permission Grants
interface UserDruidGrants {
  userId: string;
  grants: {
    druidId: string;
    grantedAt: Timestamp;
    grantedBy: string; // Admin who granted access
    expiresAt?: Timestamp; // Optional expiration
    conditions?: {
      // Optional conditional access
      timeOfDay?: string; // "business-hours-only"
      requiresMFA?: boolean;
      requiresJustification?: boolean;
    };
  }[];
}

// Example
const aliceGrants: UserDruidGrants = {
  userId: "alice@company.com",
  grants: [
    {
      druidId: "engineering-druid-1",
      grantedAt: "2025-01-01T00:00:00Z",
      grantedBy: "admin@company.com",
      expiresAt: null, // No expiration
      conditions: {
        timeOfDay: "business-hours-only",
        requiresMFA: false
      }
    },
    {
      druidId: "security-druid-1",
      grantedAt: "2025-01-01T00:00:00Z",
      grantedBy: "admin@company.com",
      conditions: {
        requiresMFA: true, // Security-sensitive, requires MFA
        requiresJustification: true // Must provide reason for use
      }
    },
    {
      druidId: "data-quality-druid",
      grantedAt: "2025-01-01T00:00:00Z",
      grantedBy: "admin@company.com"
    }
  ]
};
```

### Group-Based Grants

```typescript
// Group Grants (for scalability)
interface GroupDruidGrants {
  groupId: string; // "engineering", "security-reviewers", etc.
  grants: {
    druidId: string;
    grantedAt: Timestamp;
    grantedBy: string;
  }[];
}

// Example
const engineeringGroupGrants: GroupDruidGrants = {
  groupId: "engineering",
  grants: [
    { druidId: "engineering-druid-1", grantedAt: "...", grantedBy: "..." },
    { druidId: "engineering-druid-2", grantedAt: "...", grantedBy: "..." },
    { druidId: "data-quality-druid", grantedAt: "...", grantedBy: "..." }
  ]
};

const securityReviewersGroupGrants: GroupDruidGrants = {
  groupId: "security-reviewers",
  grants: [
    { druidId: "security-druid-1", grantedAt: "...", grantedBy: "..." },
    { druidId: "security-druid-2", grantedAt: "...", grantedBy: "..." }
  ]
};

// Alice's effective druids = union of:
//   - Her direct grants
//   - engineering group grants (she's in "engineering" group)
//   - security-reviewers group grants (she's in "security-reviewers" group)
```

### Grant Resolution

```typescript
async function resolveUserDruids(userId: string): Promise<string[]> {
  // 1. Get user's direct grants
  const directGrants = await getUserDirectGrants(userId);

  // 2. Get user's group memberships
  const userGroups = await getUserGroups(userId); // ["engineering", "security-reviewers"]

  // 3. Get grants for each group
  const groupGrants = await Promise.all(
    userGroups.map(groupId => getGroupGrants(groupId))
  );

  // 4. Union all grants
  const allDruids = new Set([
    ...directGrants.map(g => g.druidId),
    ...groupGrants.flatMap(gg => gg.grants.map(g => g.druidId))
  ]);

  // 5. Filter out expired or conditionally unavailable
  const availableDruids = Array.from(allDruids).filter(druidId => {
    const grant = findGrant(druidId, directGrants, groupGrants);
    return isGrantValid(grant, currentContext);
  });

  return availableDruids;
}
```

## Token Exchange & Realm Access

### Flow

```
1. User authenticates → receives master token (JWT)

2. User initiates session with druid(s)

3. When druid needs realm access:

   a. Druid requests realm token from token service
      - Presents user's master token
      - Specifies target realm
      - Includes druid's realmAccess proof

   b. Token service validates:
      - User's master token valid
      - Druid is in user's allowed list
      - Druid has access to target realm
      - Issues realm-scoped token

   c. Realm token contains:
      - User identity (alice@company.com)
      - Acting as druid (engineering-druid-1)
      - Realm permissions (read, write, execute)
      - Tool access grants
      - Expiration (short-lived)

   d. Elemental uses realm token for MCP tool calls
      - GitHub sees: alice@company.com (via engineering-druid-1)
      - AWS sees: alice@company.com (via engineering-druid-1)
      - All actions audited under user identity
```

### Token Structure

```typescript
interface RealmToken {
  userId: string; // "alice@company.com"
  assumedDruid: string; // "engineering-druid-1"
  realmId: string; // "engineering"
  permissions: string[]; // ["read", "write", "execute"]
  toolGrants: {
    [toolName: string]: {
      operations: string[];
      restrictions?: string[];
    };
  };
  issuedAt: Timestamp;
  expiresAt: Timestamp; // Short-lived (1 hour)
  sessionId: string; // Links to coordination session
}

// Example
const engineeringRealmToken: RealmToken = {
  userId: "alice@company.com",
  assumedDruid: "engineering-druid-1",
  realmId: "engineering",
  permissions: ["read", "write", "execute"],
  toolGrants: {
    "github": {
      operations: ["read", "write", "review"],
      restrictions: ["no-force-push"]
    },
    "cicd": {
      operations: ["read", "execute"],
      restrictions: ["dev-pipelines-only"]
    }
  },
  issuedAt: "2025-01-01T10:06:00Z",
  expiresAt: "2025-01-01T11:06:00Z",
  sessionId: "coord-session-xyz-789"
};
```

## Benefits of This Model

### 1. Simplified Permission Management

**Admin tasks:**
- Grant user access to druids (not individual realms)
- Realm access automatically derived from druids
- Change druid permissions, all users inherit changes

**Example:**
```
# Add realm access to engineering-druid-1
engineering-druid-1.realmAccess.add("data-realm")

# All users with engineering-druid-1 now have data-realm access
# No need to update individual user permissions
```

### 2. Principle of Least Privilege

Users only get permissions through carefully scoped druids:
- Can't directly access realms
- Can't bypass druid restrictions
- All actions traceable to user + druid combination

### 3. Familiar Pattern (AWS IAM)

Users already understand role assumption:
- "I need to assume the Engineering role to deploy"
- "I need to assume the Security Auditor role to run scans"
- Natural mental model

### 4. Discoverability

Users can explore:
- "What druids can I use?"
- "What can each druid do?"
- "Where can each druid go?"
- Self-service understanding of permissions

### 5. Multi-Druid Sessions

Users can assume multiple druids simultaneously:
- Engineering druid for deployment
- Security druid for audit
- Both collaborate in single session
- Like having multiple roles active in AWS

### 6. Audit Trail

Clear provenance:
```
alice@company.com (via engineering-druid-1) → github-elemental → GitHub API

Audit shows:
- Who: alice@company.com
- Via: engineering-druid-1
- Action: PR review
- When: timestamp
- Result: success
```

## API Endpoints

### Discovery APIs

```
GET /api/user/me/available-druids
  → List druids user can assume

GET /api/agents/{druidId}/capabilities
  → Details about specific druid

GET /api/agents/{druidId}/realm-access
  → What realms druid can access

GET /api/user/me/effective-permissions
  → Union of all permissions from available druids
```

### Session Management

```
POST /api/coordination/sessions
  → Initiate coordination with druid(s)

GET /api/coordination/sessions/{sessionId}
  → Session status and active druids

DELETE /api/coordination/sessions/{sessionId}
  → End session, release druids
```

### Admin APIs

```
POST /api/admin/grants/user/{userId}/druid/{druidId}
  → Grant user access to druid

DELETE /api/admin/grants/user/{userId}/druid/{druidId}
  → Revoke user access to druid

POST /api/admin/grants/group/{groupId}/druid/{druidId}
  → Grant group access to druid

GET /api/admin/grants/user/{userId}
  → View all of user's druid grants

GET /api/admin/grants/druid/{druidId}
  → View all users/groups with access to druid
```

## Next Steps

1. **Implement User-to-Druid mapping storage**
2. **Build druid discovery API**
3. **Design token exchange service**
4. **Create admin UI for grant management**
5. **Implement audit logging with user context**

---

**Last Updated:** 2025-01-01
