import { ResourceAccess } from '../models/Agent';

/**
 * Validates resource access permissions for file and URL operations
 * Supports wildcard patterns for flexible access control
 */
export class ResourceAccessValidator {
  /**
   * Check if an agent has access to a specific resource location
   */
  static hasAccess(resourceAccess: ResourceAccess | undefined, requestedLocation: string): boolean {
    if (!resourceAccess) {
      console.log(`   ❌ No resourceAccess defined`);
      return false;
    }

    // Combine all allowed locations
    const allowedLocations = [
      ...(resourceAccess.allowedLocations || []),
      ...(resourceAccess.allowedFilePaths || []),
      ...(resourceAccess.allowedUrls || [])
    ];

    console.log(`   Checking against ${allowedLocations.length} patterns:`, allowedLocations);

    if (allowedLocations.length === 0) {
      console.log(`   ❌ No allowed locations configured`);
      return false;
    }

    // Check if requested location matches any allowed pattern
    const matched = allowedLocations.some((pattern, index) => {
      const result = this.matchesPattern(requestedLocation, pattern);
      console.log(`   Pattern ${index + 1}: "${pattern}" -> ${result ? '✅ MATCH' : '❌ no match'}`);
      return result;
    });

    console.log(`   Final result: ${matched ? '✅ ACCESS GRANTED' : '❌ ACCESS DENIED'}`);
    return matched;
  }

  /**
   * Match a location against a pattern with wildcard support
   * Supports: *, **, exact matches
   */
  private static matchesPattern(location: string, pattern: string): boolean {
    // Exact match
    if (location === pattern) {
      return true;
    }

    // Special handling for common pattern: base/**/* should match base and everything under it
    // This handles the case where someone wants to grant access to a directory tree
    if (pattern.endsWith('/**/*')) {
      const prefix = pattern.slice(0, -5); // Remove '/**/*'
      if (location === prefix || location.startsWith(prefix + '/')) {
        console.log(`      Prefix match: "${prefix}" matches beginning of location`);
        return true;
      }
    }

    // Convert glob pattern to regex
    // IMPORTANT: Escape dots FIRST before wildcard replacements!
    // ** matches any number of path segments (zero or more)
    // * matches within a single path segment
    const regexPattern = pattern
      .replace(/\./g, '\\.')                   // Escape dots FIRST (literal dots in pattern)
      .replace(/\*\*/g, '<<<DOUBLE_STAR>>>')  // Placeholder for **
      .replace(/\*/g, '[^/]*')                 // * matches anything except /
      .replace(/<<<DOUBLE_STAR>>>/g, '.*')     // ** matches anything including /
      .replace(/\?/g, '.');                    // ? matches single character

    const regex = new RegExp(`^${regexPattern}$`);
    const result = regex.test(location);

    // Debug logging
    console.log(`      Regex pattern: ${regexPattern}`);
    console.log(`      Regex test: ${regex.toString()}`);
    console.log(`      Test result: ${result}`);

    return result;
  }

  /**
   * Validate a file:/// URL
   */
  static isValidFileUrl(url: string): boolean {
    return url.startsWith('file:///');
  }

  /**
   * Validate an HTTP/HTTPS URL
   */
  static isValidHttpUrl(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  /**
   * Extract the protocol from a URL
   */
  static getProtocol(url: string): 'file' | 'http' | 'https' | 'unknown' {
    if (url.startsWith('file:///')) return 'file';
    if (url.startsWith('https://')) return 'https';
    if (url.startsWith('http://')) return 'http';
    return 'unknown';
  }

  /**
   * Convert file:/// URL to filesystem path
   */
  static fileUrlToPath(fileUrl: string): string {
    if (!fileUrl.startsWith('file:///')) {
      throw new Error('Invalid file URL: must start with file:///');
    }
    return fileUrl.substring(7); // Remove 'file://'
  }

  /**
   * Get a human-readable access denied message
   */
  static getAccessDeniedMessage(requestedLocation: string, agentId: string): string {
    return `Access denied: Agent ${agentId} does not have permission to access ${requestedLocation}. Configure resourceAccess.allowedLocations to grant access.`;
  }
}
