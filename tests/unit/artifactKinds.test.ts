import {
  getArtifactKind,
  isRegisteredKind,
  listArtifactKinds,
} from '../../src/models/artifactKinds';

describe('artifactKinds registry', () => {
  it('has the v1 kinds registered', () => {
    const ids = listArtifactKinds()
      .map(k => k.id)
      .sort();
    expect(ids).toEqual(['evaluation', 'event-log', 'lesson', 'note', 'observation', 'source']);
  });

  it('returns kind by id', () => {
    const note = getArtifactKind('note');
    expect(note).toBeDefined();
    expect(note?.id).toBe('note');
    expect(note?.storage).toBe('document');
  });

  it('returns undefined for unknown id', () => {
    expect(getArtifactKind('not-a-real-kind')).toBeUndefined();
  });

  it('isRegisteredKind matches registry contents', () => {
    expect(isRegisteredKind('note')).toBe(true);
    expect(isRegisteredKind('observation')).toBe(true);
    expect(isRegisteredKind('not-a-kind')).toBe(false);
  });

  describe('document kinds', () => {
    it('note declares markdown schema and fulltext+vector indexing', () => {
      const k = getArtifactKind('note');
      expect(k?.storage).toBe('document');
      expect(k?.schema).toBe('text/markdown');
      expect(k?.indexing).toMatchObject({ fulltext: true, vector: true });
    });

    it('lesson declares markdown schema and fulltext+vector indexing', () => {
      const k = getArtifactKind('lesson');
      expect(k?.storage).toBe('document');
      expect(k?.schema).toBe('text/markdown');
      expect(k?.indexing).toMatchObject({ fulltext: true, vector: true });
    });

    it('source allows multi-MIME content and is fulltext+vector indexed', () => {
      const k = getArtifactKind('source');
      expect(k?.storage).toBe('document');
      expect(k?.schema).toBeUndefined();
      expect(k?.indexing).toMatchObject({ fulltext: true, vector: true });
    });
  });

  describe('record kinds', () => {
    it('observation declares fulltext+vector+structured indexing', () => {
      const k = getArtifactKind('observation');
      expect(k?.storage).toBe('record');
      expect(k?.indexing).toMatchObject({
        fulltext: true,
        vector: true,
        structured: ['domain', 'source'],
      });
    });

    it('evaluation declares structured-only indexing on targetUri+criteria', () => {
      const k = getArtifactKind('evaluation');
      expect(k?.storage).toBe('record');
      expect(k?.indexing).toMatchObject({ structured: ['targetUri', 'criteria'] });
      expect(k?.indexing.fulltext).toBeUndefined();
      expect(k?.indexing.vector).toBeUndefined();
    });

    it('event-log declares structured indexing on eventType+timestamp', () => {
      const k = getArtifactKind('event-log');
      expect(k?.storage).toBe('record');
      expect(k?.indexing).toMatchObject({ structured: ['eventType', 'timestamp'] });
    });
  });
});
