#!/usr/bin/env node

import { DruidApp } from './app';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the Druids multi-agent system server
 */
async function main(): Promise<void> {
  try {
    // Create and start the application
    const app = new DruidApp();
    const port = parseInt(process.env['PORT'] || '3000');
    const mcpPort = parseInt(process.env['MCP_PORT'] || '3003');
    
    console.log('🌟 Starting Druids Multi-Agent System...');
    console.log(`📍 Environment: ${process.env['NODE_ENV'] || 'development'}`);
    console.log(`🔧 API Port: ${port}`);
    console.log(`🔧 MCP Port: ${mcpPort}`);
    
    // Start main API server
    await app.start(port);
    
    // Start MCP-compliant server for external clients
    await app.startMCPServer(mcpPort);
    
    console.log('✅ Druids system started successfully!');
    console.log('🔗 External MCP clients (Goose, VS Code) can connect to the MCP server');
    
  } catch (error) {
    console.error('❌ Failed to start Druids system:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error('❌ Fatal error during startup:', error);
  process.exit(1);
});

export { main };