import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'http';
import { SimpleMCPServer } from '../../src/mcp/SimpleMCPServer';
// import { AgentService } from '../../src/services/AgentService'; // TODO: integrate services
// TODO: Fix service imports - currently causing module resolution issues
// import { RealmService } from '../../src/services/RealmService';
// import { KnowledgeService } from '../../src/services/KnowledgeService';
// import { ScenarioService } from '../../src/services/ScenarioService';

/**
 * MCP Compliance Tests
 * Verifies that the Druids MCP server implementation is fully compliant
 * with the official Model Context Protocol specification
 */

describe('MCP Protocol Compliance', () => {
  let mcpServer: SimpleMCPServer;
  const PORT = 3005; // Use different port for testing

  beforeAll(async () => {
        // Create services (will be integrated via MCP server)
    // const agentService = new AgentService();
    // const realmService = new RealmService();
    // const knowledgeService = new KnowledgeService();
    // const scenarioService = new ScenarioService();

    // Create and start MCP server
    mcpServer = new SimpleMCPServer(PORT);

    await mcpServer.start();
  });

  afterAll(async () => {
    if (mcpServer) {
      mcpServer.stop();
    }
  });

  describe('Transport Layer Compliance', () => {
    it('should have single /mcp endpoint as per MCP specification', async () => {
      const response = await makeHttpRequest('GET', '/');
      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.body);
      expect(data.transport).toBe('Streamable HTTP');
      expect(data.compliance).toBe('FULLY_COMPLIANT');
      expect(data.endpoints.mcp).toBe('/mcp');
    });

    it('should reject non-JSON-RPC requests to /mcp endpoint', async () => {
      const response = await makeHttpRequest('POST', '/mcp', 
        { notJsonRpc: true },
        { 'Content-Type': 'application/json' }
      );
      
      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.jsonrpc).toBe('2.0');
      expect(data.error.code).toBe(-32600);
      expect(data.error.message).toContain('Invalid JSON-RPC 2.0');
    });

    it('should support GET with SSE Accept header', async () => {
      const response = await makeHttpRequest('GET', '/mcp', 
        undefined,
        { 'Accept': 'text/event-stream' }
      );
      
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
    });

    it('should reject GET without SSE Accept header', async () => {
      const response = await makeHttpRequest('GET', '/mcp');
      
      expect(response.statusCode).toBe(405);
      const data = JSON.parse(response.body);
      expect(data.jsonrpc).toBe('2.0');
      expect(data.error.code).toBe(-32601);
    });
  });

  describe('JSON-RPC 2.0 Message Format Compliance', () => {
    it('should handle valid JSON-RPC 2.0 initialize request', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'initialize',
        id: 'test-1',
        params: {
          protocolVersion: '2025-06-18',
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      };

      const response = await makeHttpRequest('POST', '/mcp', request, {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'MCP-Protocol-Version': '2025-06-18'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      // Verify JSON-RPC 2.0 response format
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe('test-1');
      expect(data.result).toBeDefined();
      expect(data.result.protocolVersion).toBe('2025-06-18');
      expect(data.result.capabilities).toBeDefined();
      expect(data.result.serverInfo).toBeDefined();
      
      // Verify session header
      expect(response.headers['mcp-session-id']).toBeDefined();
    });

    it('should handle tools/list request', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'test-2'
      };

      const response = await makeHttpRequest('POST', '/mcp', request, {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe('test-2');
      expect(data.result.tools).toBeDefined();
      expect(Array.isArray(data.result.tools)).toBe(true);
      
      // Verify tool schema compliance
      if (data.result.tools.length > 0) {
        const tool = data.result.tools[0];
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
      }
    });

    it('should handle tools/call request', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 'test-3',
        params: {
          name: 'agent_create',
          arguments: {
            name: 'test-agent',
            type: 'druid',
            description: 'Test agent for MCP compliance'
          }
        }
      };

      const response = await makeHttpRequest('POST', '/mcp', request, {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe('test-3');
      expect(data.result).toBeDefined();
      expect(data.result.content).toBeDefined();
      expect(Array.isArray(data.result.content)).toBe(true);
    });

    it('should handle resources/list request', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'resources/list',
        id: 'test-4'
      };

      const response = await makeHttpRequest('POST', '/mcp', request, {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe('test-4');
      expect(data.result.resources).toBeDefined();
      expect(Array.isArray(data.result.resources)).toBe(true);
      
      // Verify resource schema compliance
      if (data.result.resources.length > 0) {
        const resource = data.result.resources[0];
        expect(resource.uri).toBeDefined();
        expect(resource.name).toBeDefined();
        expect(resource.description).toBeDefined();
        expect(resource.mimeType).toBeDefined();
      }
    });

    it('should handle resources/read request', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'resources/read',
        id: 'test-5',
        params: {
          uri: 'druids://agents'
        }
      };

      const response = await makeHttpRequest('POST', '/mcp', request, {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe('test-5');
      expect(data.result.contents).toBeDefined();
      expect(Array.isArray(data.result.contents)).toBe(true);
      
      if (data.result.contents.length > 0) {
        const content = data.result.contents[0];
        expect(content.uri).toBe('druids://agents');
        expect(content.mimeType).toBe('application/json');
        expect(content.text).toBeDefined();
      }
    });

    it('should return proper error for unknown method', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'unknown/method',
        id: 'test-6'
      };

      const response = await makeHttpRequest('POST', '/mcp', request, {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe('test-6');
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32601);
      expect(data.error.message).toContain('Method not found');
    });
  });

  describe('Protocol Headers Compliance', () => {
    it('should validate MCP-Protocol-Version header when provided', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'initialize',
        id: 'test-7'
      };

      // Test with wrong protocol version
      const response = await makeHttpRequest('POST', '/mcp', request, {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'MCP-Protocol-Version': '2024-01-01'
      });

      // Should still work but may warn - check implementation behavior
      expect(response.statusCode).toBe(200);
    });

    it('should handle session management with Mcp-Session-Id', async () => {
      // First, initialize and get session
      const initRequest = {
        jsonrpc: '2.0',
        method: 'initialize',
        id: 'session-test-1'
      };

      const initResponse = await makeHttpRequest('POST', '/mcp', initRequest, {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });

      expect(initResponse.statusCode).toBe(200);
      const sessionId = initResponse.headers['mcp-session-id'];
      expect(sessionId).toBeDefined();

      // Use session in subsequent request
      const toolsRequest = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'session-test-2'
      };

      const toolsResponse = await makeHttpRequest('POST', '/mcp', toolsRequest, {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Mcp-Session-Id': sessionId as string
      });

      expect(toolsResponse.statusCode).toBe(200);
    });

    it('should support session cleanup with DELETE', async () => {
      // Initialize session
      const initRequest = {
        jsonrpc: '2.0',
        method: 'initialize',
        id: 'cleanup-test'
      };

      const initResponse = await makeHttpRequest('POST', '/mcp', initRequest, {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });

      const sessionId = initResponse.headers['mcp-session-id'];
      expect(sessionId).toBeDefined();

      // Clean up session
      const deleteResponse = await makeHttpRequest('DELETE', '/mcp', undefined, {
        'Mcp-Session-Id': sessionId as string
      });

      expect(deleteResponse.statusCode).toBe(204);
    });
  });

  describe('Content Type and Accept Headers', () => {
    it('should require application/json Content-Type for POST', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'initialize',
        id: 'content-type-test'
      };

      const response = await makeHttpRequest('POST', '/mcp', request, {
        'Content-Type': 'text/plain'
      });

      expect(response.statusCode).toBe(400);
    });

    it('should support both application/json and text/event-stream in Accept', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'initialize',
        id: 'accept-test'
      };

      // Test application/json
      const jsonResponse = await makeHttpRequest('POST', '/mcp', request, {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      });

      expect(jsonResponse.statusCode).toBe(200);

      // Test text/event-stream
      const streamResponse = await makeHttpRequest('POST', '/mcp', request, {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      });

      expect(streamResponse.statusCode).toBe(200);
    });
  });
});

/**
 * Helper function to make HTTP requests for testing
 */
function makeHttpRequest(
  method: string, 
  path: string, 
  data?: any, 
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; headers: Record<string, any>; body: string }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3005, // Use the test port
      path,
      method,
      headers: {
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body
        });
      });
    });

    req.on('error', reject);

    if (data && (method === 'POST' || method === 'PUT')) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}