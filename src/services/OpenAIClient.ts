import { LLMConfiguration } from '../models/Agent';

/**
 * OpenAI Chat message structure
 */
export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenAI Chat completion request
 */
export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[] | string;
  stream?: boolean;
  functions?: Array<{
    name: string;
    description: string;
    parameters: any;
  }>;
  function_call?: 'auto' | 'none' | { name: string };
}

/**
 * OpenAI Chat completion response
 */
export interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIChatMessage;
    finish_reason: 'stop' | 'length' | 'function_call' | 'content_filter' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI Error response
 */
export interface OpenAIError {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

/**
 * Configuration for OpenAI client
 */
export interface OpenAIClientConfig {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
  timeout?: number;
  retries?: number;
  defaultModel?: string;
  headers?: Record<string, string>;
}

/**
 * Client for interacting with OpenAI API
 * Provides methods for chat completion and model management
 */
export class OpenAIClient {
  private apiKey: string;
  private baseUrl: string;
  private organization?: string;
  private timeout: number;
  private retries: number;
  private defaultModel: string;
  private headers: Record<string, string>;

  constructor(config: OpenAIClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    if (config.organization) {
      this.organization = config.organization;
    }
    this.timeout = config.timeout || 60000; // 60 seconds default
    this.retries = config.retries || 3;
    this.defaultModel = config.defaultModel || 'gpt-4';
    
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...config.headers
    };

    if (this.organization) {
      this.headers['OpenAI-Organization'] = this.organization;
    }
  }

  /**
   * Chat completion using conversation messages
   */
  async chat(request: OpenAIChatRequest): Promise<OpenAIChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const requestBody = {
      ...request,
      model: request.model || this.defaultModel,
      stream: false
    };

    return this.makeRequest<OpenAIChatResponse>(url, requestBody);
  }

  /**
   * Chat with an agent using its LLM configuration
   */
  async chatForAgent(
    config: LLMConfiguration,
    messages: OpenAIChatMessage[]
  ): Promise<OpenAIChatResponse> {
    const baseRequest = OpenAIClient.fromLLMConfiguration(config);
    
    // Add system message if specified in config and not already present
    const finalMessages = [...messages];
    if (config.systemPrompt && !finalMessages.some(m => m.role === 'system')) {
      finalMessages.unshift({
        role: 'system',
        content: config.systemPrompt
      });
    }

    const request: OpenAIChatRequest = {
      ...baseRequest,
      model: config.model,
      messages: finalMessages
    };

    return this.chat(request);
  }

  /**
   * List available models
   */
  async listModels(): Promise<{ data: Array<{ id: string; object: string; created: number; owned_by: string }> }> {
    const url = `${this.baseUrl}/models`;
    return this.makeRequest(url, {}, 'GET');
  }

  /**
   * Check if OpenAI API is accessible
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create an OpenAI request from Agent LLMConfiguration
   */
  static fromLLMConfiguration(config: LLMConfiguration): Partial<OpenAIChatRequest> {
    if (config.provider !== 'openai') {
      throw new Error(`OpenAIClient can only handle 'openai' provider, got '${config.provider}'`);
    }

    const request: Partial<OpenAIChatRequest> = {
      model: config.model
    };

    if (config.temperature !== undefined) {
      request.temperature = config.temperature;
    }
    if (config.maxTokens !== undefined) {
      request.max_tokens = config.maxTokens;
    }
    if (config.topP !== undefined) {
      request.top_p = config.topP;
    }
    if (config.frequencyPenalty !== undefined) {
      request.frequency_penalty = config.frequencyPenalty;
    }
    if (config.presencePenalty !== undefined) {
      request.presence_penalty = config.presencePenalty;
    }

    return request;
  }

  // Private helper methods

  private async makeRequest<T>(
    url: string, 
    body: any, 
    method: string = 'POST',
    timeoutMs?: number
  ): Promise<T> {
    const effectiveTimeout = timeoutMs || this.timeout;
    let lastError: Error;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

        const requestOptions: RequestInit = {
          method,
          headers: this.headers,
          signal: controller.signal
        };

        if (method !== 'GET' && Object.keys(body).length > 0) {
          requestOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, requestOptions);
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage: string;
          try {
            const errorJson = await response.json() as OpenAIError;
            errorMessage = errorJson.error?.message || `HTTP ${response.status}: ${response.statusText}`;
          } catch {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          
          throw new Error(`OpenAI API error: ${errorMessage}`);
        }

        const result = await response.json();
        return result as T;

      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.retries - 1) {
          // Wait before retrying (exponential backoff)
          const waitTime = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw new Error(`OpenAI API request failed after ${this.retries} attempts: ${lastError!.message}`);
  }
}

/**
 * Create a default OpenAI client configuration
 */
export function createDefaultOpenAIConfig(): OpenAIClientConfig {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  const config: OpenAIClientConfig = {
    apiKey,
    baseUrl: process.env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1',
    timeout: parseInt(process.env['OPENAI_TIMEOUT'] || '60000'),
    retries: 3,
    defaultModel: process.env['OPENAI_DEFAULT_MODEL'] || 'gpt-4'
  };

  if (process.env['OPENAI_ORGANIZATION']) {
    config.organization = process.env['OPENAI_ORGANIZATION'];
  }

  return config;
}

/**
 * Create an OpenAI client with default configuration
 */
export function createOpenAIClient(config?: Partial<OpenAIClientConfig>): OpenAIClient {
  const defaultConfig = createDefaultOpenAIConfig();
  const finalConfig = { ...defaultConfig, ...config };
  return new OpenAIClient(finalConfig);
}

export default OpenAIClient;