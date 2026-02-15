/**
 * Markdown Prompt Parser
 *
 * Parses Markdown prompts with YAML frontmatter into structured format.
 */

import matter from 'gray-matter';
import { marked, Token } from 'marked';
import { MarkdownPrompt, PromptFrontmatter } from '../models/PromptConfig';

export class MarkdownPromptParser {
  /**
   * Parse Markdown prompt with YAML frontmatter
   */
  parsePrompt(content: string): MarkdownPrompt {
    // Parse frontmatter and body
    const { data, content: body } = matter(content);

    // Validate frontmatter has required fields
    if (!data['version']) {
      throw new Error('Prompt missing required "version" field in frontmatter');
    }

    if (!data['metadata'] || !data['metadata']['name']) {
      throw new Error('Prompt missing required "metadata.name" field in frontmatter');
    }

    const frontmatter: PromptFrontmatter = {
      version: data['version'] as string,
      metadata: data['metadata'] as { name: string }
    };

    // Add optional fields only if defined
    if (data['extends']) frontmatter.extends = data['extends'] as string;
    if (data['immutable_sections']) frontmatter.immutable_sections = data['immutable_sections'] as string[];
    if (data['protected_sections']) frontmatter.protected_sections = data['protected_sections'] as string[];
    if (data['override_points']) frontmatter.override_points = data['override_points'] as string[];
    if (data['extension_points']) frontmatter.extension_points = data['extension_points'] as string[];

    // Parse H1 sections from Markdown
    const sections = this.extractSections(body);

    return {
      frontmatter,
      sections,
      raw: body
    };
  }

  /**
   * Extract H1 sections from Markdown content
   */
  private extractSections(markdown: string): Map<string, string> {
    const sections = new Map<string, string>();

    // Tokenize the markdown
    const tokens = marked.lexer(markdown);

    let currentSection = '';
    let currentTokens: Token[] = [];

    for (const token of tokens) {
      if (token.type === 'heading' && token.depth === 1) {
        // Save previous section if exists
        if (currentSection && currentTokens.length > 0) {
          const content = this.renderTokens(currentTokens);
          sections.set(currentSection, content);
        }

        // Start new section
        currentSection = token.text;
        currentTokens = [];
      } else {
        // Add token to current section
        currentTokens.push(token);
      }
    }

    // Save final section
    if (currentSection && currentTokens.length > 0) {
      const content = this.renderTokens(currentTokens);
      sections.set(currentSection, content);
    }

    return sections;
  }

  /**
   * Render tokens back to Markdown/HTML
   */
  private renderTokens(tokens: Token[]): string {
    // Parse tokens back to markdown-like text
    return marked.parser(tokens).trim();
  }

  /**
   * Validate prompt structure
   */
  validatePrompt(prompt: MarkdownPrompt): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check version format
    if (!/^\d+\.\d+\.\d+$/.test(prompt.frontmatter.version)) {
      errors.push(`Invalid version format: ${prompt.frontmatter.version} (expected semver like "1.0.0")`);
    }

    // Check for at least one section
    if (prompt.sections.size === 0) {
      errors.push('Prompt must have at least one H1 section');
    }

    // Check immutable sections exist
    if (prompt.frontmatter.immutable_sections) {
      for (const section of prompt.frontmatter.immutable_sections) {
        if (!prompt.sections.has(section)) {
          errors.push(`Immutable section "${section}" not found in prompt`);
        }
      }
    }

    // Check protected sections exist
    if (prompt.frontmatter.protected_sections) {
      for (const section of prompt.frontmatter.protected_sections) {
        if (!prompt.sections.has(section)) {
          errors.push(`Protected section "${section}" not found in prompt`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
