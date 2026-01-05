export interface MCPToolCallRequest {
  toolName: string;
  params: any;
}

export interface MCPToolCallResponse {
  content: any[];
  isError?: boolean;
}

export class HttpMCPClient {
  private baseUrl: string;
  private token: string | null;
  private authHeader: string;
  private authPrefix: string;

  constructor(
    baseUrl: string,
    token: string | null = null,
    authHeader: string = 'Authorization',
    authPrefix: string = 'Bearer '
  ) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.authHeader = authHeader;
    this.authPrefix = authPrefix;
  }

  /**
   * Call MCP tool via HTTP POST
   */
  async callTool(toolName: string, params: any): Promise<any> {
    const requestId = Date.now();

    // MCP JSON-RPC request
    const mcpRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Add auth header if token provided
    if (this.token) {
      headers[this.authHeader] = `${this.authPrefix}${this.token}`;
    }

    console.log(`🌐 MCP HTTP Request:`);
    console.log(`   URL: ${this.baseUrl}`);
    console.log(`   Tool: ${toolName}`);
    console.log(`   Params:`, JSON.stringify(params, null, 2));
    console.log(`   Auth: ${this.token ? 'Yes (service token)' : 'No'}`);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(mcpRequest)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}\n${errorText}`
        );
      }

      const mcpResponse: any = await response.json();

      // Handle JSON-RPC error
      if (mcpResponse.error) {
        console.error(`❌ MCP tool error:`, mcpResponse.error);
        throw new Error(
          mcpResponse.error.message || 'MCP tool call failed'
        );
      }

      // Extract result
      const result = mcpResponse.result;
      console.log(`✅ MCP tool ${toolName} succeeded`);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ MCP HTTP request failed:`, errorMessage);
      throw error;
    }
  }

  /**
   * List available tools from MCP server
   */
  async listTools(): Promise<any[]> {
    const requestId = Date.now();

    const mcpRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/list',
      params: {}
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.token) {
      headers[this.authHeader] = `${this.authPrefix}${this.token}`;
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(mcpRequest)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const mcpResponse: any = await response.json();

      if (mcpResponse.error) {
        throw new Error(mcpResponse.error.message || 'Unknown error');
      }

      return mcpResponse.result.tools || [];
    } catch (error) {
      console.error(`❌ Failed to list MCP tools:`, error);
      return [];
    }
  }

  /**
   * Check if MCP server is reachable
   */
  async ping(): Promise<boolean> {
    try {
      await this.listTools();
      return true;
    } catch (error) {
      return false;
    }
  }
}
