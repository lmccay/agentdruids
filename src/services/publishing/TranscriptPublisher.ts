import type { Publisher } from './Publisher';
import type { ContributionRecord, RenderedArtifact, SessionRecord } from './types';

const TRANSCRIPT_SCHEMA_VERSION = 1;

export class TranscriptPublisher implements Publisher {
  readonly modeName = 'transcript';

  render(session: SessionRecord, contributions: ContributionRecord[]): RenderedArtifact {
    const events: Array<Record<string, unknown>> = [];

    events.push({
      schema_version: TRANSCRIPT_SCHEMA_VERSION,
      event: 'session_started',
      session_id: session.sessionId,
      coordinator_agent_id: session.coordinatorAgentId,
      realm_id: session.realmId,
      prompt: session.prompt,
      participants: session.participantAgentIds,
      timestamp: session.startedAt.toISOString(),
    });

    const ordered = [...contributions].sort(
      (a, b) => a.stepNumber - b.stepNumber || a.subStepNumber - b.subStepNumber
    );
    for (const c of ordered) {
      events.push({
        schema_version: TRANSCRIPT_SCHEMA_VERSION,
        event: c.subStepNumber === 0 ? 'orchestration_step' : 'sub_contribution',
        session_id: c.sessionId,
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
        timestamp: c.createdAt.toISOString(),
      });
    }

    if (session.synthesis) {
      events.push({
        schema_version: TRANSCRIPT_SCHEMA_VERSION,
        event: 'synthesis',
        session_id: session.sessionId,
        content: session.synthesis,
        timestamp: (session.completedAt ?? new Date()).toISOString(),
      });
    }

    events.push({
      schema_version: TRANSCRIPT_SCHEMA_VERSION,
      event: 'session_completed',
      session_id: session.sessionId,
      status: session.status,
      timestamp: (session.completedAt ?? new Date()).toISOString(),
    });

    const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    return { content, contentFormat: 'jsonl', fileExtension: 'jsonl' };
  }
}
