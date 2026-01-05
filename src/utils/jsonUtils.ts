/**
 * Safely parse JSON, handling cases where the value might already be parsed
 */
export function safeJsonParse(value: any, defaultValue: any = null): any {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  
  // If it's already an object/array, return as-is
  if (typeof value === 'object') {
    return value;
  }
  
  // If it's a string, try to parse it
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.warn('Failed to parse JSON:', value, error);
      return defaultValue;
    }
  }
  
  return value;
}