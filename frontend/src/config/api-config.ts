/**
 * Dynamic API Configuration
 *
 * This configuration allows the frontend to work in multiple environments:
 * 1. Local development: Uses Vite dev server proxies (/api, /mcp)
 * 2. Production: Uses relative URLs (served from same origin)
 * 3. Remote access: Uses environment variables to specify server location
 *
 * Environment Variables (optional - set at build time):
 * - VITE_API_URL: Full URL to main API server (e.g., http://192.168.1.100:3000)
 * - VITE_MCP_URL: Full URL to MCP server (e.g., http://192.168.1.100:3003)
 * - VITE_UI_URL: Full URL to UI server (e.g., http://192.168.1.100:3004)
 */

interface ApiConfig {
  apiBaseURL: string;
  mcpBaseURL: string;
  uiBaseURL: string;
  mode: 'development' | 'production' | 'remote';
}

/**
 * Detect the current environment and build appropriate API URLs
 */
function buildApiConfig(): ApiConfig {
  const isDevelopment = import.meta.env.DEV;
  const hasCustomUrls = !!(import.meta.env.VITE_API_URL || import.meta.env.VITE_MCP_URL);

  // Remote access mode: Environment variables specify exact server locations
  if (hasCustomUrls) {
    return {
      apiBaseURL: import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000/api`,
      mcpBaseURL: import.meta.env.VITE_MCP_URL || `${window.location.protocol}//${window.location.hostname}:3003/mcp`,
      uiBaseURL: import.meta.env.VITE_UI_URL || window.location.origin,
      mode: 'remote'
    };
  }

  // Development mode: Use Vite dev server proxies (relative URLs)
  if (isDevelopment) {
    return {
      apiBaseURL: '/api',  // Proxied to druids-main:3000/api by Vite
      mcpBaseURL: '/mcp',  // Proxied to druids-mcp-server:3003/mcp by Vite
      uiBaseURL: window.location.origin,
      mode: 'development'
    };
  }

  // Production mode: Assume all services on same host (different ports or reverse proxy)
  return {
    apiBaseURL: `${window.location.protocol}//${window.location.hostname}:3000/api`,
    mcpBaseURL: `${window.location.protocol}//${window.location.hostname}:3003/mcp`,
    uiBaseURL: window.location.origin,
    mode: 'production'
  };
}

// Build configuration once at module load
export const apiConfig: ApiConfig = buildApiConfig();

// Log configuration for debugging (only in development)
if (import.meta.env.DEV) {
  console.log('🔧 API Configuration:', {
    mode: apiConfig.mode,
    apiBaseURL: apiConfig.apiBaseURL,
    mcpBaseURL: apiConfig.mcpBaseURL,
    uiBaseURL: apiConfig.uiBaseURL,
    env: {
      VITE_API_URL: import.meta.env.VITE_API_URL,
      VITE_MCP_URL: import.meta.env.VITE_MCP_URL,
      VITE_UI_URL: import.meta.env.VITE_UI_URL,
    }
  });
}

/**
 * Helper to build full URLs for debugging
 */
export function getFullUrl(path: string, service: 'api' | 'mcp' = 'api'): string {
  const base = service === 'api' ? apiConfig.apiBaseURL : apiConfig.mcpBaseURL;
  return `${base}${path.startsWith('/') ? path : '/' + path}`;
}

export default apiConfig;
