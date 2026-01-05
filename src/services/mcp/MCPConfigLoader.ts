import * as fs from 'fs';
import * as path from 'path';

export interface MCPServerConfig {
  id: string;
  name: string;
  description: string;
  transport: 'http' | 'stdio' | 'sse';
  baseUrl?: string;
  authentication: {
    type: 'bearer' | 'api_key' | 'none';
    tokenSource: 'env' | 'config';
    envVar?: string;
    header?: string;
    prefix?: string;
  };
  tools: string[];
}

export interface ElementalBinding {
  serverId: string;
  allowedTools: string[];
}

export interface RealmBinding {
  servers: string[];
  elementals: {
    [elementalId: string]: ElementalBinding;
  };
}

export interface MCPConfig {
  servers: {
    [serverId: string]: MCPServerConfig;
  };
  realmBindings: {
    [realmId: string]: RealmBinding;
  };
}

export class MCPConfigLoader {
  private config: MCPConfig | null = null;
  private configPath: string;
  private watchHandle: fs.FSWatcher | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(
      process.cwd(),
      'config/mcp-servers.json'
    );
  }

  /**
   * Load config from file
   */
  async load(): Promise<void> {
    try {
      const content = await fs.promises.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
      console.log(`✅ Loaded MCP config from ${this.configPath}`);
      if (this.config) {
        console.log(`   Servers: ${Object.keys(this.config.servers).join(', ')}`);
      }
    } catch (error) {
      console.error(`❌ Failed to load MCP config:`, error);
      throw error;
    }
  }

  /**
   * Watch config file for changes (hot reload)
   */
  watch(): void {
    if (this.watchHandle) return;

    this.watchHandle = fs.watch(this.configPath, async (eventType) => {
      if (eventType === 'change') {
        console.log(`🔄 MCP config file changed, reloading...`);
        try {
          await this.load();
          console.log(`✅ MCP config reloaded`);
        } catch (error) {
          console.error(`❌ Failed to reload MCP config:`, error);
        }
      }
    });

    console.log(`👀 Watching MCP config: ${this.configPath}`);
  }

  /**
   * Stop watching config file
   */
  stopWatching(): void {
    if (this.watchHandle) {
      this.watchHandle.close();
      this.watchHandle = null;
      console.log(`🛑 Stopped watching MCP config`);
    }
  }

  /**
   * Get server configuration
   */
  getServer(serverId: string): MCPServerConfig | null {
    if (!this.config) {
      throw new Error('MCP config not loaded. Call load() first.');
    }
    return this.config.servers[serverId] || null;
  }

  /**
   * Get all servers
   */
  getAllServers(): MCPServerConfig[] {
    if (!this.config) {
      throw new Error('MCP config not loaded. Call load() first.');
    }
    return Object.values(this.config.servers);
  }

  /**
   * Get token for server (from environment)
   */
  getServerToken(serverId: string): string | null {
    const server = this.getServer(serverId);
    if (!server || !server.authentication.envVar) {
      return null;
    }

    const token = process.env[server.authentication.envVar];
    if (!token) {
      console.warn(
        `⚠️  Token not found in environment: ${server.authentication.envVar}`
      );
      return null;
    }

    return token;
  }

  /**
   * Get realm binding
   */
  getRealmBinding(realmId: string): RealmBinding | null {
    if (!this.config) {
      throw new Error('MCP config not loaded. Call load() first.');
    }
    return this.config.realmBindings[realmId] || null;
  }

  /**
   * Get elemental's MCP server binding
   */
  getElementalBinding(
    realmId: string,
    elementalId: string
  ): ElementalBinding | null {
    const realmBinding = this.getRealmBinding(realmId);
    if (!realmBinding) return null;

    return realmBinding.elementals[elementalId] || null;
  }

  /**
   * Validate that elemental can use tool
   */
  canElementalUseTool(
    realmId: string,
    elementalId: string,
    toolName: string
  ): boolean {
    const binding = this.getElementalBinding(realmId, elementalId);
    if (!binding) return false;

    return binding.allowedTools.includes(toolName) ||
           binding.allowedTools.includes('*');
  }

  /**
   * Get raw config (for debugging)
   */
  getConfig(): MCPConfig | null {
    return this.config;
  }
}
