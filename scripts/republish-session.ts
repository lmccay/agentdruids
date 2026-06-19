#!/usr/bin/env ts-node
/**
 * One-off: republish a completed session in the requested modes.
 *
 * Usage:
 *   docker exec druids-main ts-node scripts/republish-session.ts <session-id> [mode1] [mode2] ...
 *
 * Mode defaults to ['report'] when none specified.
 */

import { DatabaseService } from '../src/services/DatabaseService';
import { getSessionPublicationService } from '../src/services/SessionPublicationService';
import type { SessionRecord } from '../src/services/publishing/types';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sessionId = args[0];
  if (!sessionId) {
    console.error('Usage: republish-session.ts <session-id> [mode1] [mode2] ...');
    process.exit(1);
  }
  const modes = args.slice(1);

  const db = DatabaseService.getInstance();
  await db.initialize();

  interface SessionRow {
    session_id: string;
    coordinator_agent_id: string | null;
    realm_id: string | null;
    prompt: string;
    status: string;
    started_at: Date;
    completed_at: Date | null;
    participant_agent_ids: string[] | null;
    metadata: Record<string, unknown> | null;
  }

  const { rows } = await db.query<SessionRow>(
    `SELECT session_id, coordinator_agent_id, realm_id, prompt, status,
            started_at, completed_at, participant_agent_ids, metadata
       FROM druids_core.coordination_sessions
      WHERE session_id = $1::varchar`,
    [sessionId]
  );

  if (rows.length === 0) {
    console.error(`No session record found for ${sessionId}`);
    process.exit(2);
  }

  const r = rows[0]!;

  // Compute synthesis from the highest-numbered orchestration step (the
  // coordinator's final integration) when nothing else is available.
  const { rows: synthRows } = await db.query<{ content: string }>(
    `SELECT content
       FROM druids_core.session_contributions
      WHERE session_id = $1::varchar AND sub_step_number = 0
      ORDER BY step_number DESC
      LIMIT 1`,
    [sessionId]
  );
  const synthesis = synthRows[0]?.content ?? null;

  const sessionRecord: SessionRecord = {
    sessionId: r.session_id,
    coordinatorAgentId: r.coordinator_agent_id,
    realmId: r.realm_id,
    prompt: r.prompt,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    participantAgentIds: r.participant_agent_ids ?? [],
    metadata: r.metadata ?? {},
    synthesis,
  };

  console.log(`📤 Republishing ${sessionId} in modes: ${modes.length > 0 ? modes.join(', ') : 'report (default)'}`);

  const pub = getSessionPublicationService();
  const results = await pub.publish(sessionRecord, [], modes.length > 0 ? modes : undefined);

  for (const result of results) {
    if (result.status === 'published') {
      console.log(`✅ ${result.modeName}: ${result.contentUri} (${result.contentSizeBytes} bytes)`);
    } else {
      console.log(`❌ ${result.modeName}: ${result.status}`);
    }
  }

  await db.close();
}

main().catch((err) => {
  console.error('Republish failed:', err);
  process.exit(1);
});
