import type { Publisher } from './Publisher';
import type { ContributionRecord, RenderedArtifact, SessionRecord } from './types';

interface StepGroup {
  stepNumber: number;
  parent: ContributionRecord | null;
  subs: ContributionRecord[];
}

function groupByStep(contributions: ContributionRecord[]): StepGroup[] {
  const byStep = new Map<number, StepGroup>();
  for (const c of contributions) {
    let group = byStep.get(c.stepNumber);
    if (!group) {
      group = { stepNumber: c.stepNumber, parent: null, subs: [] };
      byStep.set(c.stepNumber, group);
    }
    if (c.subStepNumber === 0) {
      group.parent = c;
    } else {
      group.subs.push(c);
    }
  }
  for (const group of byStep.values()) {
    group.subs.sort((a, b) => a.subStepNumber - b.subStepNumber);
  }
  return Array.from(byStep.values()).sort((a, b) => a.stepNumber - b.stepNumber);
}

export class ReportPublisher implements Publisher {
  readonly modeName = 'report';

  render(session: SessionRecord, contributions: ContributionRecord[]): RenderedArtifact {
    const lines: string[] = [];
    lines.push(`# Coordination Report`);
    lines.push('');
    lines.push(`**Session:** ${session.sessionId}`);
    if (session.coordinatorAgentId) {
      lines.push(`**Coordinator:** ${session.coordinatorAgentId}`);
    }
    if (session.participantAgentIds.length > 0) {
      lines.push(`**Participants:** ${session.participantAgentIds.join(', ')}`);
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

    const groups = groupByStep(contributions);
    if (groups.length > 0) {
      lines.push(`## Contributions`);
      lines.push('');
      for (const group of groups) {
        const parent = group.parent;
        if (parent) {
          lines.push(`### Step ${parent.stepNumber} — ${parent.agentId}${parent.agentRole ? ` _(${parent.agentRole})_` : ''}`);
          lines.push('');
          if (parent.description) {
            lines.push(`> ${parent.description}`);
            lines.push('');
          }
          if (parent.actionType) {
            lines.push(`*Action:* \`${parent.actionType}\``);
            lines.push('');
          }
          lines.push(parent.content);
          lines.push('');
        } else {
          lines.push(`### Step ${group.stepNumber}`);
          lines.push('');
        }

        if (group.subs.length > 0) {
          lines.push(`#### Collaborator contributions`);
          lines.push('');
          for (const sub of group.subs) {
            lines.push(`##### ${sub.agentId}${sub.agentRole ? ` _(${sub.agentRole})_` : ''}`);
            lines.push('');
            if (sub.actionType) {
              lines.push(`*Via:* \`${sub.actionType}\``);
              lines.push('');
            }
            if (sub.description) {
              lines.push(`> ${sub.description}`);
              lines.push('');
            }
            lines.push(sub.content);
            lines.push('');
          }
        }
      }
    }

    return {
      content: lines.join('\n'),
      contentFormat: 'markdown',
      fileExtension: 'md',
    };
  }
}
