import type { Publisher } from './Publisher';
import type { ContributionRecord, RenderedArtifact, SessionRecord } from './types';

const DATASET_SCHEMA_VERSION = 1;

export class DatasetPublisher implements Publisher {
  readonly modeName = 'dataset';

  render(session: SessionRecord, contributions: ContributionRecord[]): RenderedArtifact {
    const ordered = [...contributions].sort(
      (a, b) => a.stepNumber - b.stepNumber || a.subStepNumber - b.subStepNumber
    );

    const lines = ordered.map((c) => JSON.stringify({
      schema_version: DATASET_SCHEMA_VERSION,
      session_id: c.sessionId,
      session_prompt: session.prompt,
      coordinator_agent_id: session.coordinatorAgentId,
      step_number: c.stepNumber,
      sub_step_number: c.subStepNumber,
      agent_id: c.agentId,
      agent_role: c.agentRole,
      agent_type: c.agentType,
      action_type: c.actionType,
      description: c.description,
      content: c.content,
      content_format: c.contentFormat,
      token_count: c.tokenCount,
      duration_ms: c.durationMs,
      created_at: c.createdAt.toISOString(),
    }));

    return {
      content: lines.join('\n') + (lines.length > 0 ? '\n' : ''),
      contentFormat: 'jsonl',
      fileExtension: 'jsonl',
    };
  }
}
