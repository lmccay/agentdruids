#!/usr/bin/env node
/**
 * Example MCP client for the Druids multi-agent system (Node.js version).
 * This script demonstrates how to connect to and interact with the Druids MCP server.
 * 
 * Usage:
 *   node examples/mcp_client_example.js
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

class DruidsMCPClient {
    constructor(baseUrl = 'http://localhost:3003') {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'DruidsMCPClient-Node/1.0.0'
        };
    }

    async request(method, path, data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: method,
                headers: this.headers
            };

            const client = url.protocol === 'https:' ? https : http;
            const req = client.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(body);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(result);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${result.error || body}`));
                        }
                    } catch (e) {
                        reject(new Error(`Invalid JSON response: ${body}`));
                    }
                });
            });

            req.on('error', reject);

            if (data) {
                req.write(JSON.stringify(data));
            }
            req.end();
        });
    }

    async healthCheck() {
        return this.request('GET', '/health');
    }

    async getCapabilities() {
        return this.request('GET', '/mcp/capabilities');
    }

    async listTools() {
        const result = await this.request('GET', '/mcp/tools');
        return result.tools;
    }

    async callTool(toolName, args) {
        return this.request('POST', `/mcp/tools/${toolName}/call`, { arguments: args });
    }

    async listResources() {
        const result = await this.request('GET', '/mcp/resources');
        return result.resources;
    }

    async getResource(resourceId) {
        return this.request('GET', `/mcp/resources/${resourceId}`);
    }

    async listPrompts() {
        const result = await this.request('GET', '/mcp/prompts');
        return result.prompts;
    }

    async executePrompt(promptName, args) {
        return this.request('POST', `/mcp/prompts/${promptName}`, { arguments: args });
    }
}

async function main() {
    const client = new DruidsMCPClient();

    try {
        // Check server health
        console.log('🔍 Checking server health...');
        const health = await client.healthCheck();
        console.log(`✅ Server is healthy: ${health.status}`);
        console.log();

        // Get capabilities
        console.log('🔧 Getting server capabilities...');
        const capabilities = await client.getCapabilities();
        console.log(`📋 Server: ${capabilities.implementation.name} v${capabilities.implementation.version}`);
        console.log();

        // List available tools
        console.log('🛠️ Available tools:');
        const tools = await client.listTools();
        tools.forEach(tool => {
            console.log(`  • ${tool.name}: ${tool.description}`);
        });
        console.log();

        // Example: Create a realm
        console.log('🏞️ Creating a test realm...');
        const realmResult = await client.callTool('realm_create', {
            name: 'Node.js Client Test Realm',
            type: 'mountain',
            description: 'A test realm created via Node.js MCP client'
        });
        console.log(`✅ Realm creation result: ${realmResult.content[0].text}`);
        console.log();

        // Example: Create an agent
        console.log('🧙‍♂️ Creating a test agent...');
        const agentResult = await client.callTool('agent_create', {
            name: 'Node.js Test Elemental',
            type: 'elemental',
            description: 'A test elemental created via Node.js MCP client',
            realm: 'Node.js Client Test Realm'
        });
        console.log(`✅ Agent creation result: ${agentResult.content[0].text}`);
        console.log();

        // Example: Query knowledge
        console.log('🔍 Querying knowledge...');
        const knowledgeResult = await client.callTool('knowledge_query', {
            namespace: 'test-namespace',
            query: 'multi-agent systems',
            limit: 5
        });
        console.log(`✅ Knowledge query result: ${knowledgeResult.content[0].text}`);
        console.log();

        // Example: Generate scenario plan
        console.log('📜 Generating scenario plan...');
        const scenarioPlan = await client.executePrompt('scenario_plan', {
            objective: 'Coordinate forest preservation efforts',
            agents: ['Node.js Test Elemental', 'Forest Guardian Druid', 'Gaia Monitor']
        });
        console.log('📋 Generated scenario plan:');
        console.log(scenarioPlan.messages[0].content.text);
        console.log();

        // List available resources
        console.log('📚 Available resources:');
        const resources = await client.listResources();
        resources.forEach(resource => {
            console.log(`  • ${resource.uri}: ${resource.description}`);
        });
        console.log();

        // Get agents resource
        console.log('👥 Getting agents resource...');
        const agentsResource = await client.getResource('agents');
        console.log(`📊 Agents data: ${agentsResource.contents[0].text}`);
        console.log();

        console.log('🎉 All MCP operations completed successfully!');

    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        console.log('💡 Make sure the Druids system is running: ./scripts/dev.sh start');
    }
}

// Run the example
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { DruidsMCPClient };