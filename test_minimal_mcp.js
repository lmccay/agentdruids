#!/usr/bin/env node

/**
 * Minimal test to verify MCP JSON-RPC compatibility with Goose
 * This creates the simplest possible MCP server to isolate the issue
 */

const http = require('http');
const url = require('url');

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Protocol-Version, Mcp-Session-Id');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  
  // Only handle /mcp endpoint
  if (parsedUrl.pathname !== '/mcp') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const request = JSON.parse(body);
      
      console.log('Received request:', JSON.stringify(request, null, 2));

      if (request.method === 'initialize') {
        const sessionId = `session-${Date.now()}`;
        
        const response = {
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2025-06-18',
            capabilities: {
              tools: {
                listChanged: false
              }
            },
            serverInfo: {
              name: 'Minimal MCP Server',
              version: '1.0.0'
            }
          },
          id: request.id
        };

        res.setHeader('Mcp-Session-Id', sessionId);
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify(response));
        
        console.log('Sent response:', JSON.stringify(response, null, 2));
      } else {
        const response = {
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found'
          },
          id: request.id
        };

        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify(response));
      }
    } catch (error) {
      console.error('Error:', error);
      const response = {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error'
        },
        id: null
      };

      res.setHeader('Content-Type', 'application/json');
      res.writeHead(500);
      res.end(JSON.stringify(response));
    }
  });
});

const port = 3005;
server.listen(port, () => {
  console.log(`Minimal MCP server running on port ${port}`);
  console.log('Test with: curl -X POST http://localhost:3005/mcp -H "Content-Type: application/json" -d \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\'');
});