import type { ContributionRecord, RenderedArtifact, SessionRecord } from './types';

export interface Publisher {
  readonly modeName: string;
  render(session: SessionRecord, contributions: ContributionRecord[]): RenderedArtifact;
}
