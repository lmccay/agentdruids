#!/usr/bin/env node

/**
 * Entry point for the MCP-compliant server
 * Uses SimpleMCPServer which implements proper JSON-RPC 2.0 with /mcp endpoint
 */

import { SimpleMCPServer } from './SimpleMCPServer';

async function main(): Promise<void> {
  try {
    const port = parseInt(process.env['PORT'] || process.env['MCP_SERVER_PORT'] || '3003');
    const mainAppUrl = process.env['MAIN_APP_URL'] || 'http://druids-main:3000';
    
    console.log(`🔗 Starting MCP server on port ${port}...`);
    console.log(`📡 Main app URL: ${mainAppUrl}`);
    
    console.log('🚀 Creating SimpleMCPServer...');
    const server = new SimpleMCPServer(port, mainAppUrl);
    console.log('✅ SimpleMCPServer created');
    
    console.log('🌐 Starting server...');
    await server.start();
    console.log(`✅ MCP server running on port ${port}`);
    
    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      console.log(`\n📡 ${signal} received. Shutting down gracefully...`);
      await server.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
  } catch (error) {
    console.error('💥 Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Main process error:', error);
    process.exit(1);
  });
}

export { main };