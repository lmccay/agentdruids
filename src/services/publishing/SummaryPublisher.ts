import type { Publisher } from './Publisher';
import type { ContributionRecord, RenderedArtifact, SessionRecord } from './types';

export class SummaryPublisher implements Publisher {
  readonly modeName = 'summary';

  render(session: SessionRecord, _contributions: ContributionRecord[]): RenderedArtifact {
    const lines: string[] = [];
    lines.push(`# Session Summary`);
    lines.push('');
    lines.push(`**Session:** ${session.sessionId}`);
    if (session.coordinatorAgentId) {
      lines.push(`**Coordinator:** ${session.coordinatorAgentId}`);
    }
    if (session.completedAt) {
      lines.push(`**Completed:** ${session.completedAt.toISOString()}`);
    }
    lines.push('');
    lines.push(`## Prompt`);
    lines.push('');
    lines.push(session.prompt);
    lines.push('');
    lines.push(`## Synthesis`);
    lines.push('');
    lines.push(session.synthesis ?? '_No synthesis produced for this session._');
    lines.push('');

    return {
      content: lines.join('\n'),
      contentFormat: 'markdown',
      fileExtension: 'md',
    };
  }
}
