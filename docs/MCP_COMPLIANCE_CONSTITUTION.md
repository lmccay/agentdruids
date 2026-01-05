# MCP Compliance Constitution

## FUNDAMENTAL PRINCIPLE

**Any implementation claiming to be an "MCP Server" in the Druids system MUST be fully compliant with the official Model Context Protocol specification. Non-compliant implementations SHALL NOT be called "MCP Servers" - they are custom APIs.**

## COMPLIANCE REQUIREMENTS

### 1. Protocol Specification Adherence

All MCP Server implementations MUST:

- **Follow the official MCP specification**: https://modelcontextprotocol.io/specification/2025-06-18
- **Use JSON-RPC 2.0 message format** - NOT REST endpoints
- **Implement proper transport layer** as defined in the specification
- **Support protocol version negotiation** during initialization
- **Maintain backwards compatibility** where specified

### 2. Transport Layer Requirements

MCP Servers MUST implement at least one of the official transport methods:

#### 2.1 stdio Transport (PREFERRED)
- JSON-RPC messages over stdin/stdout
- Newline-delimited messages
- Process-based communication

#### 2.2 Streamable HTTP Transport
- **Single `/mcp` endpoint** (not multiple REST endpoints)
- **Server-Sent Events (SSE)** support for streaming
- **JSON-RPC 2.0** over HTTP POST/GET
- **Proper session management** with `Mcp-Session-Id` headers
- **Protocol version headers**: `MCP-Protocol-Version: 2025-06-18`

### 3. Message Format Requirements

All messages MUST use JSON-RPC 2.0 format:

```json
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "method": "tools/list",
  "params": {}
}
```

#### 3.1 Forbidden Patterns
- ❌ REST endpoints like `/mcp/tools`, `/mcp/resources`
- ❌ Plain JSON without JSON-RPC 2.0 wrapper
- ❌ HTTP status codes for business logic (use JSON-RPC error codes)
- ❌ Custom header schemes not defined in MCP spec

#### 3.2 Required Patterns
- ✅ JSON-RPC 2.0 requests/responses/notifications
- ✅ Proper error codes and messages
- ✅ Standard MCP method names (`tools/list`, `tools/call`, etc.)

### 4. Header Requirements (HTTP Transport)

#### 4.1 Required Headers
```http
# Client requests
Accept: application/json, text/event-stream
Content-Type: application/json
MCP-Protocol-Version: 2025-06-18

# Optional but recommended
Mcp-Session-Id: <session-id>
Last-Event-ID: <event-id>
```

#### 4.2 Forbidden Headers
- ❌ Custom API versioning schemes
- ❌ REST-style headers not defined in MCP spec

### 5. Capability Negotiation

MCP Servers MUST:

- Implement proper initialization handshake
- Declare capabilities accurately
- Support graceful capability negotiation failures
- Handle version mismatches appropriately

### 6. Security Requirements

MCP Servers MUST:

- **Validate Origin headers** for DNS rebinding protection
- **Bind to localhost only** for local servers
- **Implement proper authentication** for production use
- **Follow MCP security guidelines** from the specification

## COMPLIANCE VERIFICATION

### 7. Testing Requirements

All MCP Server implementations MUST:

- **Pass official MCP compliance tests** (if available)
- **Support MCP-compliant clients** like Goose Desktop Agent
- **Demonstrate interoperability** with other MCP implementations
- **Maintain compliance** across all feature updates

### 8. Documentation Requirements

MCP Server implementations MUST:

- **Document MCP compliance status** clearly
- **Provide connection examples** for MCP clients
- **Specify supported MCP features** and capabilities
- **Include protocol version information**

## ENFORCEMENT

### 9. Naming Convention

- ✅ **"MCP Server"** - ONLY for fully compliant implementations
- ✅ **"MCP-Compliant Server"** - Explicitly compliant implementations
- ❌ **"MCP Server"** - FORBIDDEN for non-compliant implementations
- ✅ **"Custom API Server"** - For REST or other non-MCP protocols
- ✅ **"Druids API Gateway"** - For custom protocol implementations

### 10. Code Review Requirements

All code claiming MCP compliance MUST:

- **Undergo MCP compliance review** before merging
- **Include compliance tests** in the test suite
- **Document deviations** from the specification (if any)
- **Provide migration path** for non-compliant implementations

### 11. Breaking Changes

If MCP specification updates require breaking changes:

- **Update implementations** to maintain compliance
- **Deprecate non-compliant features** with clear migration timeline
- **Communicate changes** to all stakeholders
- **Maintain backwards compatibility** where possible

## VIOLATIONS

### 12. Non-Compliance Consequences

Implementations that violate this constitution:

- **SHALL be renamed** to remove "MCP" designation
- **SHALL be documented** as custom/proprietary protocols
- **SHALL include warnings** about non-compliance
- **SHOULD be migrated** to compliant implementations

### 13. Examples of Violations

- REST endpoints claiming to be "MCP"
- Custom JSON formats without JSON-RPC 2.0
- Missing SSE support for HTTP transport
- Incorrect header requirements
- Non-standard method names or protocols

## AMENDMENT

This constitution can only be amended to:

- **Strengthen compliance requirements**
- **Clarify existing requirements**
- **Adapt to official MCP specification updates**
- **Improve verification processes**

Amendments that weaken MCP compliance requirements are **FORBIDDEN**.

---

**Effective Date**: September 20, 2025
**Last Updated**: September 20, 2025
**Authority**: Druids Project Technical Constitution
**Supersedes**: All previous MCP implementation guidelines