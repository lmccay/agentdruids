/**
 * Repository for ModelConfiguration with PostgreSQL persistence.
 *
 * Does not extend BaseRepository because ModelConfiguration uses
 * user-supplied IDs (e.g. "creative-writer") rather than generated UUIDs,
 * and has no `createdAt`/`updatedAt` on the public type. The schema does
 * track those columns for operational visibility, but they are not
 * surfaced on the returned ModelConfiguration.
 */

import { DatabaseService } from './DatabaseService';
import { ModelConfiguration } from '../models/ModelConfiguration';
import { LLMProvider } from '../models/Types';
import { safeJsonParse } from '../utils/jsonUtils';

const TABLE = 'druids_core.model_configurations';

export class ModelRepository {
  constructor(private db: DatabaseService) {}

  /** Load every stored model configuration. */
  async findAll(): Promise<ModelConfiguration[]> {
    const { rows } = await this.db.query(`SELECT * FROM ${TABLE} ORDER BY id`);
    return rows.map(row => this.rowToEntity(row));
  }

  /** Load one by id, or undefined if not found. */
  async findById(id: string): Promise<ModelConfiguration | undefined> {
    const { rows } = await this.db.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);
    if (rows.length === 0) {
      return undefined;
    }
    return this.rowToEntity(rows[0]);
  }

  /**
   * Upsert a model configuration. Used by both `addModel` (insert) and
   * `updateModel` (overwrite) — the registry doesn't distinguish.
   */
  async upsert(model: ModelConfiguration): Promise<ModelConfiguration> {
    const row = this.entityToRow(model);
    const query = `
      INSERT INTO ${TABLE} (
        id, name, description, provider, model, temperature, max_tokens,
        top_p, frequency_penalty, presence_penalty, system_prompt_prefix,
        tags, is_default, is_active, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        provider = EXCLUDED.provider,
        model = EXCLUDED.model,
        temperature = EXCLUDED.temperature,
        max_tokens = EXCLUDED.max_tokens,
        top_p = EXCLUDED.top_p,
        frequency_penalty = EXCLUDED.frequency_penalty,
        presence_penalty = EXCLUDED.presence_penalty,
        system_prompt_prefix = EXCLUDED.system_prompt_prefix,
        tags = EXCLUDED.tags,
        is_default = EXCLUDED.is_default,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING *
    `;
    const { rows } = await this.db.query(query, [
      row['id'],
      row['name'],
      row['description'],
      row['provider'],
      row['model'],
      row['temperature'],
      row['max_tokens'],
      row['top_p'],
      row['frequency_penalty'],
      row['presence_penalty'],
      row['system_prompt_prefix'],
      row['tags'],
      row['is_default'],
      row['is_active'],
    ]);
    return this.rowToEntity(rows[0]);
  }

  /** Delete by id. Returns true if a row was removed. */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  private entityToRow(model: ModelConfiguration): Record<string, unknown> {
    return {
      id: model.id,
      name: model.name,
      description: model.description,
      provider: model.provider,
      model: model.model,
      temperature: model.temperature,
      max_tokens: model.maxTokens,
      top_p: model.topP ?? null,
      frequency_penalty: model.frequencyPenalty ?? null,
      presence_penalty: model.presencePenalty ?? null,
      system_prompt_prefix: model.systemPromptPrefix ?? null,
      tags: JSON.stringify(model.tags ?? []),
      is_default: model.isDefault ?? null,
      is_active: model.isActive ?? null,
    };
  }

  private rowToEntity(row: Record<string, unknown>): ModelConfiguration {
    const tagsValue = row['tags'];
    const tags: string[] = Array.isArray(tagsValue)
      ? (tagsValue as string[])
      : safeJsonParse(typeof tagsValue === 'string' ? tagsValue : '[]', []);

    const entity: ModelConfiguration = {
      id: row['id'] as string,
      name: row['name'] as string,
      description: row['description'] as string,
      provider: row['provider'] as LLMProvider,
      model: row['model'] as string,
      temperature: Number(row['temperature']),
      maxTokens: Number(row['max_tokens']),
      tags,
    };

    if (row['top_p'] !== null && row['top_p'] !== undefined) {
      entity.topP = Number(row['top_p']);
    }
    if (row['frequency_penalty'] !== null && row['frequency_penalty'] !== undefined) {
      entity.frequencyPenalty = Number(row['frequency_penalty']);
    }
    if (row['presence_penalty'] !== null && row['presence_penalty'] !== undefined) {
      entity.presencePenalty = Number(row['presence_penalty']);
    }
    if (row['system_prompt_prefix'] !== null && row['system_prompt_prefix'] !== undefined) {
      entity.systemPromptPrefix = row['system_prompt_prefix'] as string;
    }
    if (row['is_default'] !== null && row['is_default'] !== undefined) {
      entity.isDefault = row['is_default'] as boolean;
    }
    if (row['is_active'] !== null && row['is_active'] !== undefined) {
      entity.isActive = row['is_active'] as boolean;
    }

    return entity;
  }
}
