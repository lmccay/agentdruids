# Tasks: Druids Multi-Agent System

**Input**: Design documents from `/specs/001-druids-build-a/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → ✓ Found: TypeScript/Node.js, Ollama integration, MCP Server
   → ✓ Extract: Express.js, Jest testing, single project structure
2. Load optional design documents:
   → ✓ data-model.md: 11 entities → model tasks
   → ✓ contracts/api.yaml: 19 endpoints → contract test tasks  
   → ✓ research.md: TypeScript, Ollama, MCP decisions → setup tasks
3. Generate tasks by category:
   → ✓ Setup: project init, dependencies, linting
   → ✓ Tests: contract tests, integration tests
   → ✓ Core: models, services, API endpoints
   → ✓ Integration: Ollama client, MCP server, logging
   → ✓ Polish: unit tests, performance, docs
4. Apply task rules:
   → ✓ Different files = mark [P] for parallel
   → ✓ Same file = sequential (no [P])
   → ✓ Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → ✓ All contracts have tests
   → ✓ All entities have models
   → ✓ All endpoints implemented
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Single project**: `src/`, `tests/` at repository root
- Paths assume TypeScript Node.js structure per plan.md

## Phase 3.1: Setup
- [ ] T001 Create project structure with src/, tests/ directories and TypeScript configuration
- [ ] T002 Initialize Node.js project with Express, Ollama client, Jest dependencies in package.json
- [ ] T003 [P] Configure TypeScript compiler, ESLint, and Prettier in tsconfig.json and .eslintrc.js
- [ ] T004 [P] Configure Jest testing framework in jest.config.js

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests (API Endpoints)
- [ ] T005 [P] Contract test POST /agents in tests/contract/agents.post.test.ts
- [ ] T006 [P] Contract test GET /agents in tests/contract/agents.get.test.ts
- [ ] T007 [P] Contract test GET /agents/{agentId} in tests/contract/agents.getById.test.ts
- [ ] T008 [P] Contract test PUT /agents/{agentId} in tests/contract/agents.update.test.ts
- [ ] T009 [P] Contract test DELETE /agents/{agentId} in tests/contract/agents.delete.test.ts
- [ ] T010 [P] Contract test GET /agents/{agentId}/bindings in tests/contract/agentBindings.get.test.ts
- [ ] T011 [P] Contract test POST /agents/{agentId}/bindings in tests/contract/agentBindings.post.test.ts
- [ ] T012 [P] Contract test GET /realms in tests/contract/realms.get.test.ts
- [ ] T013 [P] Contract test POST /realms in tests/contract/realms.post.test.ts
- [ ] T014 [P] Contract test GET /realms/{realmId}/ley-lines in tests/contract/leyLines.get.test.ts
- [ ] T015 [P] Contract test POST /realms/{realmId}/ley-lines in tests/contract/leyLines.post.test.ts
- [ ] T016 [P] Contract test GET /scenarios in tests/contract/scenarios.get.test.ts
- [ ] T017 [P] Contract test POST /scenarios in tests/contract/scenarios.post.test.ts
- [ ] T018 [P] Contract test POST /scenarios/{scenarioId}/execute in tests/contract/scenarioExecution.post.test.ts
- [ ] T019 [P] Contract test GET /executions/{executionId} in tests/contract/executions.get.test.ts
- [ ] T020 [P] Contract test GET /knowledge/namespaces in tests/contract/knowledgeNamespaces.get.test.ts
- [ ] T021 [P] Contract test GET /knowledge/namespaces/{namespacePath} in tests/contract/knowledge.read.test.ts
- [ ] T022 [P] Contract test POST /knowledge/namespaces/{namespacePath} in tests/contract/knowledge.write.test.ts
- [ ] T023 [P] Contract test POST /tools/access in tests/contract/toolAccess.post.test.ts

### Integration Tests (User Stories)
- [ ] T024 [P] Integration test two-agent collaboration scenario in tests/integration/agentCollaboration.test.ts
- [ ] T025 [P] Integration test realm creation and agent deployment in tests/integration/realmSetup.test.ts
- [ ] T026 [P] Integration test knowledge namespace access control in tests/integration/knowledgeAccess.test.ts
- [ ] T027 [P] Integration test tool access policy enforcement in tests/integration/toolAccess.test.ts
- [ ] T028 [P] Integration test ley line cross-realm communication in tests/integration/crossRealm.test.ts
- [ ] T029 [P] Integration test scenario execution and monitoring in tests/integration/scenarioExecution.test.ts

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Data Models
- [ ] T030 [P] Agent interface and types in src/models/Agent.ts
- [ ] T031 [P] AgentConfiguration interface in src/models/AgentConfiguration.ts
- [ ] T032 [P] DruidPersona interface in src/models/DruidPersona.ts
- [ ] T033 [P] SpecializationProfile interface in src/models/SpecializationProfile.ts
- [ ] T034 [P] Realm interface and types in src/models/Realm.ts
- [ ] T035 [P] LeyLineConnection interface in src/models/LeyLineConnection.ts
- [ ] T036 [P] KnowledgeNamespace interface in src/models/KnowledgeNamespace.ts
- [ ] T037 [P] Scenario and execution interfaces in src/models/Scenario.ts
- [ ] T038 [P] MCPServer and tool access interfaces in src/models/MCPServer.ts
- [ ] T039 [P] WorkflowExecution and interaction interfaces in src/models/WorkflowExecution.ts
- [ ] T040 [P] Policy and access control interfaces in src/models/AccessControl.ts

### Core Services
- [ ] T041 [P] AgentService for CRUD operations in src/services/AgentService.ts
- [ ] T042 [P] RealmService for realm management in src/services/RealmService.ts
- [ ] T043 [P] KnowledgeService for namespace operations in src/services/KnowledgeService.ts
- [ ] T044 [P] ScenarioService for scenario management in src/services/ScenarioService.ts
- [ ] T045 [P] OllamaClient for LLM integration in src/services/OllamaClient.ts
- [ ] T046 [P] MCPServerManager for tool integration in src/services/MCPServerManager.ts
- [ ] T047 [P] PolicyEngine for access control in src/services/PolicyEngine.ts

### API Endpoints (Sequential - same Express app)
- [ ] T048 Agent management endpoints in src/api/agents.ts
- [ ] T049 Agent bindings endpoints in src/api/agentBindings.ts
- [ ] T050 Realm management endpoints in src/api/realms.ts
- [ ] T051 Ley line management endpoints in src/api/leyLines.ts
- [ ] T052 Scenario management endpoints in src/api/scenarios.ts
- [ ] T053 Scenario execution endpoints in src/api/executions.ts
- [ ] T054 Knowledge access endpoints in src/api/knowledge.ts
- [ ] T055 Tool access management endpoints in src/api/tools.ts

### Main Application
- [ ] T056 Express server setup and middleware in src/app.ts
- [ ] T057 Request validation and error handling in src/middleware/validation.ts
- [ ] T058 Policy enforcement middleware in src/middleware/policyEnforcement.ts
- [ ] T059 Audit logging middleware in src/middleware/auditLogging.ts

## Phase 3.4: Integration
- [ ] T060 Connect AgentService to Ollama client for LLM integration
- [ ] T061 Connect KnowledgeService to file system storage with access controls
- [ ] T062 Implement FULLY COMPLIANT MCP Server (JSON-RPC 2.0 + SSE) for external clients - NOT REST API
- [ ] T063 Connect ScenarioService to WorkflowExecution engine
- [ ] T064 Implement ley line communication between realms
- [ ] T065 Connect PolicyEngine to all service operations
- [ ] T066 Setup comprehensive error handling and logging

## Phase 3.5: Polish
- [ ] T067 [P] Unit tests for AgentService in tests/unit/AgentService.test.ts
- [ ] T068 [P] Unit tests for KnowledgeService in tests/unit/KnowledgeService.test.ts
- [ ] T069 [P] Unit tests for PolicyEngine in tests/unit/PolicyEngine.test.ts
- [ ] T070 [P] Unit tests for OllamaClient in tests/unit/OllamaClient.test.ts
- [ ] T071 [P] Performance tests for concurrent agent operations in tests/performance/concurrency.test.ts
- [ ] T072 [P] Performance tests for knowledge access latency in tests/performance/knowledge.test.ts
- [ ] T073 [P] Update README.md with setup and usage instructions
- [ ] T074 [P] Create API documentation from OpenAPI spec
- [ ] T075 Execute quickstart validation scenarios
- [ ] T076 Remove code duplication and optimize performance
- [ ] T077 Final integration testing with all components

## Dependencies
- Setup (T001-T004) before everything
- All contract tests (T005-T023) before any implementation (T030+)
- All integration tests (T024-T029) before any implementation (T030+)
- Models (T030-T040) before services (T041-T047)
- Services (T041-T047) before API endpoints (T048-T055)
- API endpoints (T048-T055) before main app (T056-T059)
- Core implementation (T030-T059) before integration (T060-T066)
- Integration (T060-T066) before polish (T067-T077)

## Parallel Example
```bash
# Launch all contract tests together (Phase 3.2):
Task: "Contract test POST /agents in tests/contract/agents.post.test.ts"
Task: "Contract test GET /agents in tests/contract/agents.get.test.ts"
Task: "Contract test GET /agents/{agentId} in tests/contract/agents.getById.test.ts"
# ... continue with all T005-T023

# Launch all data models together (Phase 3.3):
Task: "Agent interface and types in src/models/Agent.ts"
Task: "AgentConfiguration interface in src/models/AgentConfiguration.ts"
Task: "DruidPersona interface in src/models/DruidPersona.ts"
# ... continue with all T030-T040

# Launch all core services together:
Task: "AgentService for CRUD operations in src/services/AgentService.ts"
Task: "RealmService for realm management in src/services/RealmService.ts"
Task: "KnowledgeService for namespace operations in src/services/KnowledgeService.ts"
# ... continue with all T041-T047
```

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing
- Commit after each task or logical group
- API endpoints (T048-T055) must be sequential (same Express app file structure)
- All policy enforcement goes through PolicyEngine service

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**: ✅
   - 19 endpoints → 19 contract test tasks [P] (T005-T023)
   - 19 endpoints → 8 API implementation files (T048-T055)
   
2. **From Data Model**: ✅
   - 11 entities → 11 model creation tasks [P] (T030-T040)
   - Relationships → service layer tasks (T041-T047)
   
3. **From User Stories**: ✅
   - Quickstart scenarios → 6 integration tests [P] (T024-T029)
   - Validation scenarios → validation task (T075)

4. **Ordering**: ✅
   - Setup → Tests → Models → Services → Endpoints → Integration → Polish
   - Dependencies block parallel execution

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All contracts have corresponding tests (T005-T023)
- [x] All entities have model tasks (T030-T040)
- [x] All tests come before implementation (T005-T029 before T030+)
- [x] Parallel tasks truly independent ([P] tasks use different files)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] TDD enforced: tests must fail before implementation
- [x] Complete coverage: 77 tasks for full implementation
