import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Check if a string is a valid UUID
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Convert a string ID to a deterministic UUID
 * This allows consistent mapping of string IDs to UUIDs
 */
export function stringToUUID(str: string): string {
  if (isValidUUID(str)) {
    return str; // Already a UUID
  }
  
  // Create a deterministic UUID based on the string
  // Using UUID v5 with a namespace for consistent results
  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(str).digest('hex');
  
  // Format as UUID v4
  return [
    hash.substr(0, 8),
    hash.substr(8, 4),
    '4' + hash.substr(13, 3), // Version 4
    ((parseInt(hash.substr(16, 1), 16) & 3) | 8).toString(16) + hash.substr(17, 3), // Variant 10
    hash.substr(20, 12)
  ].join('-');
}

/**
 * Agent ID mapping for database compatibility
 */
export class AgentIdMapper {
  private static stringToUuidMap: Map<string, string> = new Map();
  private static uuidToStringMap: Map<string, string> = new Map();
  
  /**
   * Get or create a UUID for a string ID
   */
  static getUUIDForStringId(stringId: string): string {
    if (isValidUUID(stringId)) {
      return stringId; // Already a UUID
    }
    
    if (this.stringToUuidMap.has(stringId)) {
      return this.stringToUuidMap.get(stringId)!;
    }
    
    // Generate a new UUID for this string ID
    const uuid = generateUUID();
    this.stringToUuidMap.set(stringId, uuid);
    this.uuidToStringMap.set(uuid, stringId);
    
    console.log(`🔄 Mapped string ID "${stringId}" to UUID "${uuid}"`);
    return uuid;
  }
  
  /**
   * Map an existing slug ID to an existing UUID (for database loading)
   */
  static mapExistingAgent(slugId: string, uuid: string): void {
    this.stringToUuidMap.set(slugId, uuid);
    this.uuidToStringMap.set(uuid, slugId);
    console.log(`🔗 Mapped existing agent "${slugId}" to UUID "${uuid}"`);
  }

  /**
   * Get the string ID for a UUID (if it was mapped)
   */
  static getStringIdForUUID(uuid: string): string | null {
    return this.uuidToStringMap.get(uuid) || null;
  }
  
  /**
   * Check if an ID needs UUID mapping
   */
  static needsMapping(id: string): boolean {
    return !isValidUUID(id);
  }
}