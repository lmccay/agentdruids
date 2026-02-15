/**
 * Prompt Source Resolver
 *
 * Loads prompts from various sources (file://, https://, s3://, etc.)
 */

import fs from 'fs/promises';
import path from 'path';
import { PromptSourceConfig, PromptLayer } from '../models/PromptConfig';
import { MarkdownPromptParser } from './MarkdownPromptParser';

export interface PromptLoader {
  canHandle(url: string): boolean;
  load(url: string, config?: PromptSourceConfig): Promise<string>;
}

/**
 * File system loader (file:// URLs)
 */
export class FileLoader implements PromptLoader {
  private basePath: string;

  constructor(basePath?: string) {
    // Default to prompts directory in project root
    this.basePath = basePath || path.join(process.cwd(), 'prompts');
  }

  canHandle(url: string): boolean {
    return url.startsWith('file://') || !url.includes('://');
  }

  async load(url: string, config?: PromptSourceConfig): Promise<string> {
    // Remove file:// prefix if present
    let filePath = url.replace('file://', '');

    // If relative path, resolve against base path
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(this.basePath, filePath);
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(`✅ Loaded prompt from file: ${filePath}`);
      return content;
    } catch (error: any) {
      if (config?.fallback) {
        console.warn(`⚠️  Failed to load ${filePath}, trying fallback: ${config.fallback}`);
        const { fallback, ...configWithoutFallback } = config;
        return this.load(fallback, configWithoutFallback);
      }

      if (config?.optional) {
        console.log(`ℹ️  Optional prompt not found: ${filePath}`);
        throw new Error(`Optional prompt not found: ${filePath}`);
      }

      throw new Error(`Failed to load prompt from ${filePath}: ${error.message}`);
    }
  }
}

/**
 * HTTPS loader (https:// URLs) - Placeholder for Phase 2
 */
export class HttpsLoader implements PromptLoader {
  canHandle(url: string): boolean {
    return url.startsWith('https://') || url.startsWith('http://');
  }

  async load(_url: string, _config?: PromptSourceConfig): Promise<string> {
    // TODO: Implement in Phase 2
    throw new Error('HTTPS loader not yet implemented. Use file:// URLs for now.');
  }
}

/**
 * Main prompt source resolver
 */
export class PromptSourceResolver {
  private loaders: PromptLoader[];
  private parser: MarkdownPromptParser;

  constructor(loaders?: PromptLoader[]) {
    this.parser = new MarkdownPromptParser();
    this.loaders = loaders || [
      new FileLoader(),
      new HttpsLoader()
    ];
  }

  /**
   * Resolve and parse a prompt from a source
   */
  async resolveSource(config: PromptSourceConfig): Promise<PromptLayer> {
    // Find appropriate loader
    const loader = this.loaders.find(l => l.canHandle(config.url));

    if (!loader) {
      throw new Error(`No loader found for URL: ${config.url}`);
    }

    // Load content
    const content = await loader.load(config.url, config);

    // Parse Markdown
    const parsed = this.parser.parsePrompt(content);

    // Validate
    const validation = this.parser.validatePrompt(parsed);
    if (!validation.valid) {
      throw new Error(`Invalid prompt at ${config.url}: ${validation.errors.join(', ')}`);
    }

    // Convert to PromptLayer
    const layer: PromptLayer = {
      version: parsed.frontmatter.version,
      metadata: parsed.frontmatter.metadata,
      sections: parsed.sections,
      source_url: config.url,
      loaded_at: new Date()
    };
    if (parsed.frontmatter.immutable_sections) {
      layer.immutable_sections = parsed.frontmatter.immutable_sections;
    }
    if (parsed.frontmatter.protected_sections) {
      layer.protected_sections = parsed.frontmatter.protected_sections;
    }
    if (parsed.frontmatter.override_points) {
      layer.override_points = parsed.frontmatter.override_points;
    }
    if (parsed.frontmatter.extension_points) {
      layer.extension_points = parsed.frontmatter.extension_points;
    }
    return layer;
  }

  /**
   * Parse agent extension from database (Markdown string)
   */
  async parseAgentExtension(markdown: string, agentId: string): Promise<PromptLayer> {
    const parsed = this.parser.parsePrompt(markdown);

    // Agent extensions don't need full validation
    const layer: PromptLayer = {
      version: parsed.frontmatter.version || '1.0.0',
      metadata: parsed.frontmatter.metadata || { name: `Agent Extension: ${agentId}` },
      sections: parsed.sections,
      source_url: `database://agent/${agentId}/extension`,
      loaded_at: new Date()
    };
    if (parsed.frontmatter.override_points) {
      layer.override_points = parsed.frontmatter.override_points;
    }
    if (parsed.frontmatter.extension_points) {
      layer.extension_points = parsed.frontmatter.extension_points;
    }
    return layer;
  }
}
