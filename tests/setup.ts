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

// Mock `marked` globally. The package is ESM-only from v17, and jest's default
// CJS transform can't load `node_modules/marked/lib/marked.esm.js` — every test
// that transitively imports `MarkdownPromptParser.ts` would otherwise blow up
// with `SyntaxError: Unexpected token 'export'`. The mock simulates enough of
// marked's lexer/parser shape for our prompt-parsing tests; tests that need
// real markdown behavior can override per-file with their own `jest.mock`.
jest.mock('marked', () => {
  const mockLexer = (text: string) => {
    const tokens: { type: string; depth?: number; text: string; raw: string }[] = [];
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('# ')) {
        const heading = line.substring(2).trim();
        tokens.push({ type: 'heading', depth: 1, text: heading, raw: line + '\n' });
      } else if (line.trim() && !line.startsWith('---')) {
        tokens.push({ type: 'paragraph', text: line, raw: line + '\n' });
      }
    }
    return tokens;
  };

  const mockParser = (tokens: { type: string; text: string }[]) =>
    tokens
      .filter(t => t.type === 'paragraph')
      .map(t => t.text)
      .join('\n');

  return {
    marked: {
      lexer: jest.fn(mockLexer),
      parser: jest.fn(mockParser),
    },
    Token: {} as unknown,
  };
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
