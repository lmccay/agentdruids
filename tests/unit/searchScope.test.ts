import { resolveSearchScope } from '../../src/services/searchScope';

// Realm ids mirror the real fixtures so the intent reads clearly:
//   ETS  = a customer's realm-scoped corpus
//   LV   = a *different* accessible realm (another campaign) that must NOT leak
const ETS = '4faa3fd4-ets';
const LV = '6825f24b-launch-visibility';
const OTHER = 'zzzz-unaccessible';

describe('resolveSearchScope', () => {
  describe('session research realms (the campaign scope)', () => {
    it('pins an unanchored coordinator to the session scope, not its whole accessible set', () => {
      // Coordinator can reach both ETS and LV, but this session researches ETS.
      const scope = resolveSearchScope({
        accessibleRealms: [ETS, LV],
        sessionResearchRealms: [ETS],
        currentRealm: null, // not "present" anywhere (no travel)
      });
      expect(scope).toEqual([ETS]);
      expect(scope).not.toContain(LV); // no cross-campaign leak
    });

    it('isolates concurrent sessions of the same coordinator', () => {
      const common = { accessibleRealms: [ETS, LV], currentRealm: null };
      const sessionA = resolveSearchScope({ ...common, sessionResearchRealms: [ETS] });
      const sessionB = resolveSearchScope({ ...common, sessionResearchRealms: [LV] });
      expect(sessionA).toEqual([ETS]);
      expect(sessionB).toEqual([LV]);
    });

    it('clamps session realms to the agent grants (cannot widen scope)', () => {
      const scope = resolveSearchScope({
        accessibleRealms: [ETS],
        sessionResearchRealms: [ETS, OTHER], // OTHER not accessible
        currentRealm: null,
      });
      expect(scope).toEqual([ETS]);
    });
  });

  describe('current presence', () => {
    it('always includes the realm the agent is present in (elemental bound realm)', () => {
      const scope = resolveSearchScope({
        accessibleRealms: [ETS],
        sessionResearchRealms: [ETS],
        currentRealm: ETS,
      });
      expect(scope).toEqual([ETS]);
    });

    it("treats 'default' / null presence as no realm", () => {
      expect(resolveSearchScope({ accessibleRealms: [ETS], currentRealm: 'default' })).toEqual([]);
      expect(resolveSearchScope({ accessibleRealms: [ETS], currentRealm: null })).toEqual([]);
    });
  });

  describe('explicit realms', () => {
    it('adds explicitly requested realms that are accessible', () => {
      const scope = resolveSearchScope({
        accessibleRealms: [ETS, LV],
        sessionResearchRealms: [ETS],
        currentRealm: null,
        explicitRealms: [LV],
      });
      expect(scope.sort()).toEqual([ETS, LV].sort());
    });

    it('ignores explicitly requested realms outside the agent grants', () => {
      const scope = resolveSearchScope({
        accessibleRealms: [ETS],
        currentRealm: null,
        explicitRealms: [OTHER],
      });
      expect(scope).toEqual([]);
    });
  });

  describe('safe default', () => {
    it('returns [] (global-only) when nothing contributes — no accessible-set fallback', () => {
      const scope = resolveSearchScope({
        accessibleRealms: [ETS, LV], // reachable, but not the scope
        sessionResearchRealms: [],
        currentRealm: null,
      });
      expect(scope).toEqual([]);
    });
  });

  it('de-duplicates across sources', () => {
    const scope = resolveSearchScope({
      accessibleRealms: [ETS, LV],
      sessionResearchRealms: [ETS],
      currentRealm: ETS,
      explicitRealms: [ETS, LV],
    });
    expect(scope.sort()).toEqual([ETS, LV].sort());
  });
});
