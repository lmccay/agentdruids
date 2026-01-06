import { LLMConfiguration } from '../models/Agent';

/**
 * Request structure for generating text completions
 */
export interface GenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  stream?: boolean;
  raw?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
    seed?: number;
    num_predict?: number;
    stop?: string[];
  };
}

/**
 * Response structure for text generation
 */
export interface GenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Chat message structure
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

/**
 * Chat completion request
 */
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
    seed?: number;
    num_predict?: number;
    stop?: string[];
  };
}

/**
 * Chat completion response
 */
export interface ChatResponse {
  model: string;
  created_at: string;
  message: ChatMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Model information structure
 */
export interface ModelInfo {
  name: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
  modified_at: string;
}

/**
 * Model list response
 */
export interface ModelsResponse {
  models: ModelInfo[];
}

/**
 * Embedding request
 */
export interface EmbeddingRequest {
  model: string;
  prompt: string;
}

/**
 * Embedding response
 */
export interface EmbeddingResponse {
  embedding: number[];
}

/**
 * Tool definition for MCP integration
 */
export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

/**
 * Tool call request from the model
 */
export interface ToolCall {
  id?: string;
  name: string;
  parameters: Record<string, any>;
}

/**
 * Tool call result
 */
export interface ToolCallResult {
  id?: string;
  name: string;
  result: any;
  error?: string;
}

/**
 * Enhanced chat message with tool support
 */
export interface EnhancedChatMessage extends ChatMessage {
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * Chat request with tool support
 */
export interface ToolChatRequest extends Omit<ChatRequest, 'messages'> {
  messages: EnhancedChatMessage[];
  tools?: Tool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

/**
 * Chat response with tool calls
 */
export interface ToolChatResponse extends Omit<ChatResponse, 'message'> {
  message: EnhancedChatMessage;
}

/**
 * Error response from Ollama API
 */
export interface OllamaError {
  error: string;
}

/**
 * Configuration for Ollama client
 */
export interface OllamaClientConfig {
  baseUrl: string;
  timeout?: number;
  retries?: number;
  defaultModel?: string;
  headers?: Record<string, string>;
}

/**
 * Streaming callback function type
 */
export type StreamCallback = (chunk: GenerateResponse | ChatResponse) => void;

/**
 * Client for interacting with Ollama LLM service
 * Provides methods for text generation, chat completion, and model management
 */
export class OllamaClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private defaultModel: string;
  private headers: Record<string, string>;

  constructor(config: OllamaClientConfig) {
    this.baseUrl = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
    this.timeout = config.timeout || 300000; // 5 minutes for model operations
    this.retries = config.retries || 3;
    this.defaultModel = config.defaultModel || 'qwen2.5:1.5b';
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers
    };
  }

  /**
   * Generate text completion using a prompt
   */
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const url = `${this.baseUrl}/api/generate`;
    const requestBody = {
      ...request,
      model: request.model || this.defaultModel,
      stream: false // Non-streaming by default
    };

    return this.makeRequest<GenerateResponse>(url, requestBody);
  }

  /**
   * Generate text completion with streaming
   */
  async generateStream(request: GenerateRequest, callback: StreamCallback): Promise<void> {
    const url = `${this.baseUrl}/api/generate`;
    const requestBody = {
      ...request,
      model: request.model || this.defaultModel,
      stream: true
    };

    await this.makeStreamingRequest(url, requestBody, callback);
  }

  /**
   * Chat completion using conversation messages
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const url = `${this.baseUrl}/api/chat`;
    const requestBody = {
      ...request,
      model: request.model || this.defaultModel,
      stream: false
    };

    return this.makeRequest<ChatResponse>(url, requestBody);
  }

  /**
   * Chat completion with streaming
   */
  async chatStream(request: ChatRequest, callback: StreamCallback): Promise<void> {
    const url = `${this.baseUrl}/api/chat`;
    const requestBody = {
      ...request,
      model: request.model || this.defaultModel,
      stream: true
    };

    await this.makeStreamingRequest(url, requestBody, callback);
  }

  /**
   * Generate embeddings for a given prompt
   */
  async embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const url = `${this.baseUrl}/api/embeddings`;
    const requestBody = {
      ...request,
      model: request.model || this.defaultModel
    };

    return this.makeRequest<EmbeddingResponse>(url, requestBody);
  }

  /**
   * List available models
   */
  async listModels(): Promise<ModelsResponse> {
    const url = `${this.baseUrl}/api/tags`;
    return this.makeRequest<ModelsResponse>(url, {}, 'GET');
  }

  /**
   * Pull/download a model
   */
  async pullModel(modelName: string): Promise<void> {
    const url = `${this.baseUrl}/api/pull`;
    const requestBody = { name: modelName };
    
    // Model pulling can take a long time, use extended timeout
    await this.makeRequest(url, requestBody, 'POST', 300000); // 5 minutes
  }

  /**
   * Check if a model exists locally
   */
  async hasModel(modelName: string): Promise<boolean> {
    try {
      const response = await this.listModels();
      return response.models.some(model => model.name === modelName);
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName: string): Promise<void> {
    const url = `${this.baseUrl}/api/delete`;
    const requestBody = { name: modelName };
    
    await this.makeRequest(url, requestBody);
  }

  /**
   * Check if Ollama service is running and accessible
   */
  async isHealthy(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/api/tags`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
        signal: AbortSignal.timeout(5000) // 5 second timeout for health check
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create an LLM configuration compatible request from Agent LLMConfiguration
   */
  static fromLLMConfiguration(config: LLMConfiguration): Partial<GenerateRequest | ChatRequest> {
    if (config.provider !== 'ollama') {
      throw new Error(`OllamaClient can only handle 'ollama' provider, got '${config.provider}'`);
    }

    const options: any = {};
    
    if (config.temperature !== undefined) {
      options.temperature = config.temperature;
    }
    if (config.topP !== undefined) {
      options.top_p = config.topP;
    }
    if (config.maxTokens !== undefined) {
      options.num_predict = config.maxTokens;
    }
    if (config.frequencyPenalty !== undefined) {
      options.repeat_penalty = config.frequencyPenalty;
    }

    return {
      model: config.model,
      options: Object.keys(options).length > 0 ? options : undefined
    };
  }

  /**
   * Generate text for an agent using its LLM configuration
   */
  async generateForAgent(
    config: LLMConfiguration, 
    prompt: string, 
    systemPrompt?: string
  ): Promise<GenerateResponse> {
    const baseRequest = OllamaClient.fromLLMConfiguration(config);
    
    const request: GenerateRequest = {
      ...baseRequest,
      model: config.model,
      prompt,
      system: systemPrompt || config.systemPrompt
    } as GenerateRequest;

    return this.generate(request);
  }

  /**
   * Chat with an agent using its LLM configuration
   */
  async chatForAgent(
    config: LLMConfiguration,
    messages: ChatMessage[]
  ): Promise<ChatResponse> {
    const baseRequest = OllamaClient.fromLLMConfiguration(config);
    
    // Add system message if specified in config and not already present
    const finalMessages = [...messages];
    if (config.systemPrompt && !finalMessages.some(m => m.role === 'system')) {
      finalMessages.unshift({
        role: 'system',
        content: config.systemPrompt
      });
    }

    const request: ChatRequest = {
      ...baseRequest,
      model: config.model,
      messages: finalMessages
    } as ChatRequest;

    return this.chat(request);
  }

  /**
   * Initialize Ollama client with common models for the Druids system
   */
  async ensureRequiredModels(models: string[] = ['llama2', 'mistral', 'codellama']): Promise<void> {
    const missingModels: string[] = [];
    
    for (const model of models) {
      const hasModel = await this.hasModel(model);
      if (!hasModel) {
        missingModels.push(model);
      }
    }

    if (missingModels.length > 0) {
      console.warn(`Missing models detected: ${missingModels.join(', ')}`);
      console.log('Consider pulling required models using: ollama pull <model-name>');
    }
  }

  // Private helper methods

  private async makeRequest<T>(
    url: string, 
    body: any, 
    method: string = 'POST',
    timeoutMs?: number
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs || this.timeout);

        const response = await fetch(url, {
          method,
          headers: this.headers,
          body: method !== 'GET' ? JSON.stringify(body) : null,
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text();
          let errorMessage: string;
          
          try {
            const errorJson = JSON.parse(errorBody) as OllamaError;
            errorMessage = errorJson.error || `HTTP ${response.status}: ${response.statusText}`;
          } catch {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          
          throw new Error(`Ollama API error: ${errorMessage}`);
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

    throw lastError || new Error('Unknown error occurred');
  }

  private async makeStreamingRequest(
    url: string,
    body: any,
    callback: StreamCallback
  ): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage: string;
        
        try {
          const errorJson = JSON.parse(errorBody) as OllamaError;
          errorMessage = errorJson.error || `HTTP ${response.status}: ${response.statusText}`;
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        
        throw new Error(`Ollama API error: ${errorMessage}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();

      // Timeout for streaming response (5 minutes for long generations)
      const timeoutMs = 300000;
      let timeoutHandle: NodeJS.Timeout;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Ollama streaming timeout after 5 minutes')), timeoutMs);
      });

      try {
        await Promise.race([
          (async () => {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              const chunk = decoder.decode(value);
              const lines = chunk.split('\n').filter(line => line.trim());

              for (const line of lines) {
                try {
                  const parsed = JSON.parse(line);
                  callback(parsed);

                  if (parsed.done) {
                    return;
                  }
                } catch (error) {
                  // Skip malformed JSON lines
                  console.warn('Failed to parse streaming response line:', line);
                }
              }
            }
          })(),
          timeoutPromise
        ]);
      } finally {
        reader.releaseLock();
        clearTimeout(timeoutHandle!);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Chat completion with tool calling support
   */
  async chatWithTools(request: ToolChatRequest): Promise<ToolChatResponse> {
    const url = `${this.baseUrl}/api/chat`;
    
    // Prepare the system message with tool definitions
    let systemMessage = this.buildToolSystemMessage(request.tools || []);
    
    // Find existing system message and merge or add new one
    const messages = [...request.messages];
    const existingSystemIndex = messages.findIndex(m => m.role === 'system');
    
    if (existingSystemIndex >= 0 && messages[existingSystemIndex]) {
      messages[existingSystemIndex].content += '\n\n' + systemMessage;
    } else {
      messages.unshift({ role: 'system', content: systemMessage });
    }

    const requestBody = {
      model: request.model || this.defaultModel,
      messages,
      stream: false,
      options: {
        temperature: 0.3,
        top_p: 0.9,
        top_k: 40,
        num_predict: 512,
        ...request.options
      }
    };

    const response = await this.makeRequest<ChatResponse>(url, requestBody);
    
    // Parse tool calls from the response
    const enhancedMessage = this.parseToolCalls(response.message);
    
    return {
      ...response,
      message: enhancedMessage
    };
  }

  /**
   * Execute a conversation with automatic tool calling
   */
  async executeWithTools(
    messages: EnhancedChatMessage[],
    tools: Tool[],
    toolExecutor: (toolCall: ToolCall) => Promise<ToolCallResult>,
    maxIterations: number = 5
  ): Promise<EnhancedChatMessage[]> {
    const conversationHistory = [...messages];
    let iteration = 0;
    
    while (iteration < maxIterations) {
      const response = await this.chatWithTools({
        model: this.defaultModel,
        messages: conversationHistory,
        tools
      });
      
      conversationHistory.push(response.message);
      
      // Check if the assistant made tool calls
      if (response.message.tool_calls && response.message.tool_calls.length > 0) {
        // Execute all tool calls
        for (const toolCall of response.message.tool_calls) {
          try {
            const result = await toolExecutor(toolCall);
            
            // Add tool result to conversation
            const toolResultMessage: EnhancedChatMessage = {
              role: 'user',
              content: `Tool ${result.name} result: ${JSON.stringify(result.result)}`
            };
            const callId = result.id || toolCall.id;
            if (callId) {
              toolResultMessage.tool_call_id = callId;
            }
            conversationHistory.push(toolResultMessage);
          } catch (error) {
            // Add error result to conversation
            const toolErrorMessage: EnhancedChatMessage = {
              role: 'user',
              content: `Tool ${toolCall.name} error: ${error instanceof Error ? error.message : String(error)}`
            };
            if (toolCall.id) {
              toolErrorMessage.tool_call_id = toolCall.id;
            }
            conversationHistory.push(toolErrorMessage);
          }
        }
        
        iteration++;
        continue;
      }
      
      // No tool calls, conversation is complete
      break;
    }
    
    return conversationHistory;
  }

  /**
   * Check if the qwen2.5:1.5b model is available
   */
  async ensureModelAvailable(): Promise<boolean> {
    try {
      const models = await this.listModels();
      const targetModel = 'qwen2.5:1.5b';
      
      const modelExists = models.models.some(model => 
        model.name === targetModel || model.name.startsWith(targetModel)
      );
      
      if (!modelExists) {
        console.warn(`Model ${targetModel} not found. Available models:`, 
          models.models.map(m => m.name));
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Failed to check model availability:', error);
      return false;
    }
  }

  /**
   * Build system message with tool definitions
   */
  private buildToolSystemMessage(tools: Tool[]): string {
    if (tools.length === 0) {
      return 'You are a helpful AI assistant.';
    }
    
    const toolDescriptions = tools.map(tool => 
      `- ${tool.name}: ${tool.description}`
    ).join('\n');
    
    return `You are a helpful AI assistant with access to the following tools:

${toolDescriptions}

When you need to use a tool, respond with a JSON object in this exact format:
{
  "tool_call": {
    "name": "tool_name",
    "parameters": {
      "param1": "value1",
      "param2": "value2"
    }
  }
}

You can use multiple tools in sequence if needed. Always think step by step and use tools when they can help provide better answers.`;
  }

  /**
   * Parse tool calls from model response
   */
  private parseToolCalls(message: ChatMessage): EnhancedChatMessage {
    const enhancedMessage: EnhancedChatMessage = { ...message };
    
    try {
      // Look for JSON tool call in the response
      const toolCallMatch = message.content.match(/\{\s*"tool_call"\s*:[^}]+\}[^}]*\}/g);
      
      if (toolCallMatch) {
        const toolCalls: ToolCall[] = [];
        
        for (const match of toolCallMatch) {
          try {
            const parsed = JSON.parse(match);
            if (parsed.tool_call && parsed.tool_call.name) {
              toolCalls.push({
                id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: parsed.tool_call.name,
                parameters: parsed.tool_call.parameters || {}
              });
            }
          } catch (e) {
            // Skip malformed tool calls
            console.warn('Failed to parse tool call:', match);
          }
        }
        
        if (toolCalls.length > 0) {
          enhancedMessage.tool_calls = toolCalls;
        }
      }
    } catch (error) {
      // If parsing fails, just return the original message
      console.warn('Failed to parse tool calls from response:', error);
    }
    
    return enhancedMessage;
  }
}

/**
 * Create a default Ollama client configuration
 */
export function createDefaultOllamaConfig(): OllamaClientConfig {
  return {
    baseUrl: process.env['OLLAMA_BASE_URL'] || process.env['OLLAMA_URL'] || 'http://localhost:11434',
    timeout: parseInt(process.env['OLLAMA_TIMEOUT'] || '300000'),
    retries: 3,
    defaultModel: process.env['OLLAMA_MODEL'] || 'qwen2.5:1.5b'
  };
}

/**
 * Create an Ollama client with default configuration
 */
export function createOllamaClient(config?: Partial<OllamaClientConfig>): OllamaClient {
  const defaultConfig = createDefaultOllamaConfig();
  const finalConfig = { ...defaultConfig, ...config };
  return new OllamaClient(finalConfig);
}

export default OllamaClient;
