"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaClient = void 0;
exports.createDefaultOllamaConfig = createDefaultOllamaConfig;
exports.createOllamaClient = createOllamaClient;
/**
 * Client for interacting with Ollama LLM service
 * Provides methods for text generation, chat completion, and model management
 */
class OllamaClient {
    constructor(config) {
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
    async generate(request) {
        const url = `${this.baseUrl}/api/generate`;
        const requestBody = {
            ...request,
            model: request.model || this.defaultModel,
            stream: false // Non-streaming by default
        };
        return this.makeRequest(url, requestBody);
    }
    /**
     * Generate text completion with streaming
     */
    async generateStream(request, callback) {
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
    async chat(request) {
        const url = `${this.baseUrl}/api/chat`;
        const requestBody = {
            ...request,
            model: request.model || this.defaultModel,
            stream: false
        };
        return this.makeRequest(url, requestBody);
    }
    /**
     * Chat completion with streaming
     */
    async chatStream(request, callback) {
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
    async embeddings(request) {
        const url = `${this.baseUrl}/api/embeddings`;
        const requestBody = {
            ...request,
            model: request.model || this.defaultModel
        };
        return this.makeRequest(url, requestBody);
    }
    /**
     * List available models
     */
    async listModels() {
        const url = `${this.baseUrl}/api/tags`;
        return this.makeRequest(url, {}, 'GET');
    }
    /**
     * Pull/download a model
     */
    async pullModel(modelName) {
        const url = `${this.baseUrl}/api/pull`;
        const requestBody = { name: modelName };
        // Model pulling can take a long time, use extended timeout
        await this.makeRequest(url, requestBody, 'POST', 300000); // 5 minutes
    }
    /**
     * Check if a model exists locally
     */
    async hasModel(modelName) {
        try {
            const response = await this.listModels();
            return response.models.some(model => model.name === modelName);
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Delete a model
     */
    async deleteModel(modelName) {
        const url = `${this.baseUrl}/api/delete`;
        const requestBody = { name: modelName };
        await this.makeRequest(url, requestBody);
    }
    /**
     * Check if Ollama service is running and accessible
     */
    async isHealthy() {
        try {
            const url = `${this.baseUrl}/api/tags`;
            const response = await fetch(url, {
                method: 'GET',
                headers: this.headers,
                signal: AbortSignal.timeout(5000) // 5 second timeout for health check
            });
            return response.ok;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Create an LLM configuration compatible request from Agent LLMConfiguration
     */
    static fromLLMConfiguration(config) {
        if (config.provider !== 'ollama') {
            throw new Error(`OllamaClient can only handle 'ollama' provider, got '${config.provider}'`);
        }
        const options = {};
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
    async generateForAgent(config, prompt, systemPrompt) {
        const baseRequest = OllamaClient.fromLLMConfiguration(config);
        const request = {
            ...baseRequest,
            model: config.model,
            prompt,
            system: systemPrompt || config.systemPrompt
        };
        return this.generate(request);
    }
    /**
     * Chat with an agent using its LLM configuration
     */
    async chatForAgent(config, messages) {
        const baseRequest = OllamaClient.fromLLMConfiguration(config);
        // Add system message if specified in config and not already present
        const finalMessages = [...messages];
        if (config.systemPrompt && !finalMessages.some(m => m.role === 'system')) {
            finalMessages.unshift({
                role: 'system',
                content: config.systemPrompt
            });
        }
        const request = {
            ...baseRequest,
            model: config.model,
            messages: finalMessages
        };
        return this.chat(request);
    }
    /**
     * Initialize Ollama client with common models for the Druids system
     */
    async ensureRequiredModels(models = ['llama2', 'mistral', 'codellama']) {
        const missingModels = [];
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
    async makeRequest(url, body, method = 'POST', timeoutMs) {
        let lastError = null;
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
                    let errorMessage;
                    try {
                        const errorJson = JSON.parse(errorBody);
                        errorMessage = errorJson.error || `HTTP ${response.status}: ${response.statusText}`;
                    }
                    catch {
                        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                    }
                    throw new Error(`Ollama API error: ${errorMessage}`);
                }
                const result = await response.json();
                return result;
            }
            catch (error) {
                lastError = error;
                if (attempt < this.retries - 1) {
                    // Wait before retrying (exponential backoff)
                    const waitTime = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }
        throw lastError || new Error('Unknown error occurred');
    }
    async makeStreamingRequest(url, body, callback) {
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
                let errorMessage;
                try {
                    const errorJson = JSON.parse(errorBody);
                    errorMessage = errorJson.error || `HTTP ${response.status}: ${response.statusText}`;
                }
                catch {
                    errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }
                throw new Error(`Ollama API error: ${errorMessage}`);
            }
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Response body is not readable');
            }
            const decoder = new TextDecoder();
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
                    }
                    catch (error) {
                        // Skip malformed JSON lines
                        console.warn('Failed to parse streaming response line:', line);
                    }
                }
            }
        }
        finally {
            clearTimeout(timeout);
        }
    }
    /**
     * Chat completion with tool calling support
     */
    async chatWithTools(request) {
        const url = `${this.baseUrl}/api/chat`;
        // Prepare the system message with tool definitions
        let systemMessage = this.buildToolSystemMessage(request.tools || []);
        // Find existing system message and merge or add new one
        const messages = [...request.messages];
        const existingSystemIndex = messages.findIndex(m => m.role === 'system');
        if (existingSystemIndex >= 0 && messages[existingSystemIndex]) {
            messages[existingSystemIndex].content += '\n\n' + systemMessage;
        }
        else {
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
        const response = await this.makeRequest(url, requestBody);
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
    async executeWithTools(messages, tools, toolExecutor, maxIterations = 5) {
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
                        const toolResultMessage = {
                            role: 'user',
                            content: `Tool ${result.name} result: ${JSON.stringify(result.result)}`
                        };
                        const callId = result.id || toolCall.id;
                        if (callId) {
                            toolResultMessage.tool_call_id = callId;
                        }
                        conversationHistory.push(toolResultMessage);
                    }
                    catch (error) {
                        // Add error result to conversation
                        const toolErrorMessage = {
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
    async ensureModelAvailable() {
        try {
            const models = await this.listModels();
            const targetModel = 'qwen2.5:1.5b';
            const modelExists = models.models.some(model => model.name === targetModel || model.name.startsWith(targetModel));
            if (!modelExists) {
                console.warn(`Model ${targetModel} not found. Available models:`, models.models.map(m => m.name));
                return false;
            }
            return true;
        }
        catch (error) {
            console.error('Failed to check model availability:', error);
            return false;
        }
    }
    /**
     * Build system message with tool definitions
     */
    buildToolSystemMessage(tools) {
        if (tools.length === 0) {
            return 'You are a helpful AI assistant.';
        }
        const toolDescriptions = tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n');
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
    parseToolCalls(message) {
        const enhancedMessage = { ...message };
        try {
            // Look for JSON tool call in the response
            const toolCallMatch = message.content.match(/\{\s*"tool_call"\s*:[^}]+\}[^}]*\}/g);
            if (toolCallMatch) {
                const toolCalls = [];
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
                    }
                    catch (e) {
                        // Skip malformed tool calls
                        console.warn('Failed to parse tool call:', match);
                    }
                }
                if (toolCalls.length > 0) {
                    enhancedMessage.tool_calls = toolCalls;
                }
            }
        }
        catch (error) {
            // If parsing fails, just return the original message
            console.warn('Failed to parse tool calls from response:', error);
        }
        return enhancedMessage;
    }
}
exports.OllamaClient = OllamaClient;
/**
 * Create a default Ollama client configuration
 */
function createDefaultOllamaConfig() {
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
function createOllamaClient(config) {
    const defaultConfig = createDefaultOllamaConfig();
    const finalConfig = { ...defaultConfig, ...config };
    return new OllamaClient(finalConfig);
}
exports.default = OllamaClient;
