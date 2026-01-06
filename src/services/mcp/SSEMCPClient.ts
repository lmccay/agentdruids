export interface MCPToolCallRequest {
  toolName: string;
  params: any;
}

export interface MCPToolCallResponse {
  content: any[];
  isError?: boolean;
}

/**
 * MCP Client for Server-Sent Events (SSE) transport
 * Handles streaming responses from MCP servers that use SSE
 */
export class SSEMCPClient {
  private baseUrl: string;
  private token: string | null;
  private authHeader: string;
  private authPrefix: string;
  private customHeaders: Record<string, string>;

  constructor(
    baseUrl: string,
    token: string | null = null,
    authHeader: string = 'Authorization',
    authPrefix: string = 'Bearer ',
    customHeaders: Record<string, string> = {}
  ) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.authHeader = authHeader;
    this.authPrefix = authPrefix;
    this.customHeaders = customHeaders;
  }

  /**
   * Call MCP tool via SSE
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

    // Build headers for SSE
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    };

    // Add auth header if token provided
    if (this.token) {
      headers[this.authHeader] = `${this.authPrefix}${this.token}`;
    }

    // Add any custom headers from config
    Object.assign(headers, this.customHeaders);

    console.log(`🌐 MCP SSE Request:`);
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

      // Parse SSE stream
      const result = await this.parseSSEResponse(response);
      console.log(`✅ MCP SSE tool ${toolName} succeeded`);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ MCP SSE request failed:`, errorMessage);
      throw error;
    }
  }

  /**
   * Parse Server-Sent Events response stream
   */
  private async parseSSEResponse(response: Response): Promise<any> {
    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: any = null;
    let error: any = null;

    // Timeout for SSE stream (60 seconds)
    const timeout = 60000;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('SSE stream timeout after 60s')), timeout);
    });

    try {
      // Race between reading the stream and timeout
      await Promise.race([
        (async () => {
          while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            // Decode chunk and add to buffer
            buffer += decoder.decode(value, { stream: true });

            // Process complete events in buffer
            const events = buffer.split('\n\n');
            // Keep incomplete event in buffer
            buffer = events.pop() || '';

            for (const event of events) {
              if (!event.trim()) continue;

              const parsedEvent = this.parseSSEEvent(event);

              if (parsedEvent.type === 'message' && parsedEvent.data) {
                try {
                  const jsonData = JSON.parse(parsedEvent.data);

                  // Handle JSON-RPC response
                  if (jsonData.jsonrpc === '2.0') {
                    if (jsonData.error) {
                      error = jsonData.error;
                      console.error(`❌ MCP SSE error:`, error);
                    } else if (jsonData.result !== undefined) {
                      result = jsonData.result;
                    }
                  }
                } catch (parseError) {
                  console.warn(`⚠️ Failed to parse SSE data as JSON:`, parsedEvent.data);
                }
              }
            }
          }

          // Handle any remaining data in buffer
          if (buffer.trim()) {
            const parsedEvent = this.parseSSEEvent(buffer);
            if (parsedEvent.type === 'message' && parsedEvent.data) {
              try {
                const jsonData = JSON.parse(parsedEvent.data);
                if (jsonData.result !== undefined) {
                  result = jsonData.result;
                }
              } catch (parseError) {
                // Ignore parse errors for trailing data
              }
            }
          }
        })(),
        timeoutPromise
      ]);

    } finally {
      reader.releaseLock();
    }

    if (error) {
      throw new Error(error.message || 'MCP tool call failed');
    }

    if (result === null) {
      throw new Error('No result received from SSE stream');
    }

    return result;
  }

  /**
   * Parse a single SSE event
   */
  private parseSSEEvent(eventText: string): { type: string; data: string } {
    const lines = eventText.split('\n');
    let eventType = 'message';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        data += line.substring(5).trim();
      }
    }

    return { type: eventType, data };
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
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };

    if (this.token) {
      headers[this.authHeader] = `${this.authPrefix}${this.token}`;
    }

    // Add any custom headers from config
    Object.assign(headers, this.customHeaders);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(mcpRequest)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await this.parseSSEResponse(response);
      return result.tools || [];
    } catch (error) {
      console.error(`❌ Failed to list MCP tools via SSE:`, error);
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
