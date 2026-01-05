// Global test setup
import { config } from 'dotenv';

// Load test environment variables
process.env['NODE_ENV'] = 'test';
process.env['PORT'] = '3001';
process.env['OLLAMA_BASE_URL'] = 'http://localhost:11434';

// Load .env file for test environment if it exists
config({ path: '.env' });

// Increase timeout for async operations
jest.setTimeout(10000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
