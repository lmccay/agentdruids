#!/usr/bin/env node

import { DruidApp } from './app';
import * as dotenv from 'dotenv';
import { migrationService } from './services/MigrationService';
import { RepositoryManager } from './services/RepositoryManager';
import { modelRegistryService } from './services/ModelRegistryService';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the Druids multi-agent system server
 */
async function main(): Promise<void> {
  try {
    console.log('🌟 Starting Druids Multi-Agent System...');
    console.log(`📍 Environment: ${process.env['NODE_ENV'] || 'development'}`);

    // Run database migrations before starting application
    console.log('');
    console.log('🔧 Database Initialization');
    console.log('─────────────────────────');
    try {
      await migrationService.runPendingMigrations();
    } catch (error) {
      console.error('❌ Database migration failed. Cannot start application.');
      console.error('');
      console.error('To reset database to clean state:');
      console.error('  ./scripts/db-reset.sh');
      console.error('');
      console.error('For more help, see docs/DATABASE_SETUP.md');
      throw error;
    }

    console.log('');
    console.log('🚀 Application Startup');
    console.log('─────────────────────────');

    // Wire repository-backed services that must be ready before requests.
    // The model registry loads its rows from the database (see migration 005).
    const repositoryManager = await RepositoryManager.initialize();
    modelRegistryService.setRepository(repositoryManager.models);
    await modelRegistryService.initialize();

    // Create and start the application
    const app = new DruidApp();
    const port = parseInt(process.env['PORT'] || '3000');
    const mcpPort = parseInt(process.env['MCP_PORT'] || '3003');

    console.log(`🔧 API Port: ${port}`);
    console.log(`🔧 MCP Port: ${mcpPort}`);

    // Start main API server
    await app.start(port);

    // Start MCP-compliant server for external clients
    await app.startMCPServer(mcpPort);

    console.log('');
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