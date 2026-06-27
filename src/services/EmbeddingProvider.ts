import axios from 'axios';

/**
 * Pluggable embedding provider (Phase B / rung #4).
 *
 * Mirrors the LLM-provider abstraction: the *deployment* chooses the embedding
 * backend (and thus its privacy posture) via env — the design doesn't bake it
 * in. Default is the bundled-local TEI container, so the corpus is indexed
 * on-box without egress even when the generation model is remote; switch to a
 * local Ollama, a remote OpenAI-compatible API, or `none` (→ lexical fallback).
 *
 * Env:
 *   EMBEDDING_PROVIDER   tei (default) | ollama | openai | none
 *   EMBEDDING_SERVICE_URL  base URL for the provider
 *   EMBEDDING_MODEL      model id/name
 *   EMBEDDING_DIM        vector dimension (must match the chunk_embeddings column)
 *   EMBEDDING_API_KEY    bearer token for openai-compatible providers
 *
 * See docs/phase-b-embeddings.md.
 */

export interface EmbeddingProvider {
  readonly name: string;
  readonly modelName: string;
  readonly dimension: number;
  isEnabled(): boolean;
  /** Embed a batch of texts → one vector per input (same order). */
  embed(texts: string[]): Promise<number[][]>;
}

const PROVIDER = (process.env['EMBEDDING_PROVIDER'] || 'tei').toLowerCase();
const SERVICE_URL = (process.env['EMBEDDING_SERVICE_URL'] || 'http://druids-embeddings:80').replace(/\/$/, '');
const MODEL = process.env['EMBEDDING_MODEL'] || 'sentence-transformers/all-MiniLM-L6-v2';
const DIM = Math.max(1, Number(process.env['EMBEDDING_DIM'] || 384));
const API_KEY = process.env['EMBEDDING_API_KEY'] || process.env['OPENAI_API_KEY'] || '';
const TIMEOUT_MS = Number(process.env['EMBEDDING_TIMEOUT_MS'] || 60000);

abstract class BaseProvider implements EmbeddingProvider {
  abstract readonly name: string;
  readonly modelName = MODEL;
  readonly dimension = DIM;
  isEnabled(): boolean {
    return true;
  }
  abstract embed(texts: string[]): Promise<number[][]>;
}

/** HuggingFace Text-Embeddings-Inference — native /embed returns number[][]. */
class TeiProvider extends BaseProvider {
  readonly name = 'tei';
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { data } = await axios.post(
      `${SERVICE_URL}/embed`,
      { inputs: texts, normalize: true, truncate: true },
      { timeout: TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
    );
    if (!Array.isArray(data)) throw new Error('TEI: unexpected embedding response');
    return data as number[][];
  }
}

/** Ollama — /api/embed accepts a batch and returns { embeddings: number[][] }. */
class OllamaProvider extends BaseProvider {
  readonly name = 'ollama';
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { data } = await axios.post(
      `${SERVICE_URL}/api/embed`,
      { model: MODEL, input: texts },
      { timeout: TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
    );
    const embeddings = data?.embeddings;
    if (!Array.isArray(embeddings)) throw new Error('Ollama: unexpected embedding response');
    return embeddings as number[][];
  }
}

/** OpenAI-compatible /embeddings → { data: [{ embedding: number[] }] }. */
class OpenAIProvider extends BaseProvider {
  readonly name = 'openai';
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { data } = await axios.post(
      `${SERVICE_URL}/embeddings`,
      { model: MODEL, input: texts },
      {
        timeout: TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json', ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
      }
    );
    const arr = data?.data;
    if (!Array.isArray(arr)) throw new Error('OpenAI: unexpected embedding response');
    return arr.map((d: { embedding: number[] }) => d.embedding);
  }
}

/** Disabled — retrieval falls back to lexical. */
class NoneProvider extends BaseProvider {
  readonly name = 'none';
  override isEnabled(): boolean {
    return false;
  }
  async embed(): Promise<number[][]> {
    throw new Error('Embedding provider is disabled (EMBEDDING_PROVIDER=none)');
  }
}

function build(): EmbeddingProvider {
  switch (PROVIDER) {
    case 'ollama':
      return new OllamaProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'none':
      return new NoneProvider();
    case 'tei':
    default:
      return new TeiProvider();
  }
}

let singleton: EmbeddingProvider | null = null;
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!singleton) singleton = build();
  return singleton;
}

/** Format a JS vector as a pgvector literal: '[0.1,0.2,...]'. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}
