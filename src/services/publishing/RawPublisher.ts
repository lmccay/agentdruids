import type { Publisher } from './Publisher';
import type { ContributionRecord, RenderedArtifact, SessionRecord } from './types';

export class RawPublisher implements Publisher {
  readonly modeName = 'raw';

  render(session: SessionRecord, contributions: ContributionRecord[]): RenderedArtifact {
    const lines: string[] = [];
    lines.push(`# Raw Contributions`);
    lines.push('');
    lines.push(`**Session:** ${session.sessionId}`);
    if (session.completedAt) {
      lines.push(`**Completed:** ${session.completedAt.toISOString()}`);
    }
    lines.push('');
    lines.push(`## Prompt`);
    lines.push('');
    lines.push(session.prompt);
    lines.push('');

    const ordered = [...contributions].sort(
      (a, b) => a.stepNumber - b.stepNumber || a.subStepNumber - b.subStepNumber
    );
    for (const c of ordered) {
      const heading = c.subStepNumber === 0
        ? `## Step ${c.stepNumber} — ${c.agentId}`
        : `### Step ${c.stepNumber}.${c.subStepNumber} — ${c.agentId}`;
      lines.push(`${heading}${c.agentRole ? ` _(${c.agentRole})_` : ''}`);
      lines.push('');
      if (c.actionType) {
        lines.push(`*Action:* \`${c.actionType}\``);
        lines.push('');
      }
      if (c.description) {
        lines.push(`> ${c.description}`);
        lines.push('');
      }
      lines.push(c.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return {
      content: lines.join('\n'),
      contentFormat: 'markdown',
      fileExtension: 'md',
    };
  }
}
