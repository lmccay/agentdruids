/**
 * Utility functions for matching MCP tool patterns with wildcard support
 *
 * Pattern format: "server:tool" or "server:pattern*"
 * Examples:
 *   - "github:*" - All tools from github server
 *   - "github:list_*" - All github tools starting with "list_"
 *   - "github:get_pull_request" - Specific tool
 */

export interface ServerTool {
  server: string;
  tool: string;
}

/**
 * Parse a tool pattern into server and tool components
 * @param pattern - Pattern like "github:list_*" or "list_pull_requests" (legacy)
 * @returns Object with server and toolPattern, or null if invalid
 */
export function parseToolPattern(pattern: string): { server: string | null; toolPattern: string } {
  if (!pattern) {
    return { server: null, toolPattern: '' };
  }

  // Check if pattern contains server namespace
  if (pattern.includes(':')) {
    const parts = pattern.split(':', 2);
    const server = parts[0]?.trim() || null;
    const toolPattern = parts[1]?.trim() || '';
    return { server, toolPattern };
  }

  // Legacy format (no server namespace)
  return { server: null, toolPattern: pattern.trim() };
}

/**
 * Convert a glob pattern to a regular expression
 * @param pattern - Glob pattern like "list_*" or "*_request"
 * @returns RegExp for matching
 */
function globToRegex(pattern: string): RegExp {
  // Escape special regex characters except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // Replace * with .*
  const regex = escaped.replace(/\*/g, '.*');

  return new RegExp(`^${regex}$`);
}

/**
 * Check if a tool pattern matches a specific server:tool combination
 * @param pattern - Pattern from agent's mcpTools (e.g., "github:list_*")
 * @param serverTool - The actual server and tool being requested
 * @returns true if pattern matches
 */
export function matchesToolPattern(pattern: string, serverTool: ServerTool): boolean {
  const { server: patternServer, toolPattern } = parseToolPattern(pattern);

  // If pattern has server namespace, it must match
  if (patternServer && patternServer !== serverTool.server) {
    return false;
  }

  // Match tool pattern
  if (toolPattern === '*') {
    return true; // Matches all tools (from this server if namespaced)
  }

  if (toolPattern.includes('*')) {
    // Wildcard pattern matching
    const regex = globToRegex(toolPattern);
    return regex.test(serverTool.tool);
  }

  // Exact match
  return toolPattern === serverTool.tool;
}

/**
 * Check if an agent has permission to use a specific tool from a server
 * @param agentMcpTools - Array of tool patterns from agent's mcpTools field
 * @param serverTool - The server and tool being requested
 * @returns true if agent has permission
 */
export function hasToolPermission(
  agentMcpTools: string[] | undefined,
  serverTool: ServerTool
): boolean {
  if (!agentMcpTools || agentMcpTools.length === 0) {
    return false;
  }

  return agentMcpTools.some(pattern => matchesToolPattern(pattern, serverTool));
}

/**
 * Find which server provides a specific tool from a list of available servers
 * @param toolName - Name of the tool (without server prefix)
 * @param availableServers - Map of server configs
 * @returns Server ID that provides this tool, or null if not found
 */
export function findServerForTool(
  toolName: string,
  availableServers: Map<string, { tools: string[] }>
): string | null {
  for (const [serverId, serverConfig] of availableServers.entries()) {
    if (serverConfig.tools.includes(toolName)) {
      return serverId;
    }
  }
  return null;
}
