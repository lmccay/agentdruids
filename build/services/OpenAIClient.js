"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIClient = void 0;
exports.createDefaultOpenAIConfig = createDefaultOpenAIConfig;
exports.createOpenAIClient = createOpenAIClient;
/**
 * Client for interacting with OpenAI API
 * Provides methods for chat completion and model management
 */
class OpenAIClient {
    constructor(config) {
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
    async chat(request) {
        const url = `${this.baseUrl}/chat/completions`;
        const requestBody = {
            ...request,
            model: request.model || this.defaultModel,
            stream: false
        };
        return this.makeRequest(url, requestBody);
    }
    /**
     * Chat with an agent using its LLM configuration
     */
    async chatForAgent(config, messages) {
        const baseRequest = OpenAIClient.fromLLMConfiguration(config);
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
     * List available models
     */
    async listModels() {
        const url = `${this.baseUrl}/models`;
        return this.makeRequest(url, {}, 'GET');
    }
    /**
     * Check if OpenAI API is accessible
     */
    async isHealthy() {
        try {
            await this.listModels();
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Create an OpenAI request from Agent LLMConfiguration
     */
    static fromLLMConfiguration(config) {
        if (config.provider !== 'openai') {
            throw new Error(`OpenAIClient can only handle 'openai' provider, got '${config.provider}'`);
        }
        const request = {
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
    async makeRequest(url, body, method = 'POST', timeoutMs) {
        const effectiveTimeout = timeoutMs || this.timeout;
        let lastError;
        for (let attempt = 0; attempt < this.retries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
                const requestOptions = {
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
                    let errorMessage;
                    try {
                        const errorJson = await response.json();
                        errorMessage = errorJson.error?.message || `HTTP ${response.status}: ${response.statusText}`;
                    }
                    catch {
                        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                    }
                    throw new Error(`OpenAI API error: ${errorMessage}`);
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
        throw new Error(`OpenAI API request failed after ${this.retries} attempts: ${lastError.message}`);
    }
}
exports.OpenAIClient = OpenAIClient;
/**
 * Create a default OpenAI client configuration
 */
function createDefaultOpenAIConfig() {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required');
    }
    const config = {
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
function createOpenAIClient(config) {
    const defaultConfig = createDefaultOpenAIConfig();
    const finalConfig = { ...defaultConfig, ...config };
    return new OpenAIClient(finalConfig);
}
exports.default = OpenAIClient;
