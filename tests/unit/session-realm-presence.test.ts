/**
 * Session Realm Presence Tests
 *
 * SessionAgentManager decides where an agent starts a session. It must use the
 * same precedence as AgentService.resolveCurrentRealm — currentRealmId, then
 * boundRealmId, then the sentinel — because resolveCurrentRealm consults session
 * state *first*, so a wrong initial value wins over the agent's own record.
 *
 * The precedence was previously reversed (boundRealmId first) while a comment
 * claimed it matched. The consequence: an agent that had explicitly left its
 * realm was put back inside its bound realm for the whole session.
 *
 * These tests exercise the exported decision directly, rather than standing up
 * the class (which needs a task queue and a session id). createAgentSessionState
 * calls the same function, so there is no second copy to drift.
 */

import { isRealmSentinel, REALM_SENTINEL_SLUG } from '../../src/utils/uuidUtils';
import { resolveInitialSessionRealm } from '../../src/services/SessionAgentManager';

// The real decision, not a copy of it — createAgentSessionState calls this.
const initialRealmFor = resolveInitialSessionRealm;

const realmsVisitedFor = (initialRealm: string): string[] =>
  isRealmSentinel(initialRealm) ? [] : [initialRealm];

describe('Session realm presence', () => {
  it('starts an elemental in its bound realm', () => {
    expect(initialRealmFor({ boundRealmId: 'launch-visibility' })).toBe('launch-visibility');
  });

  it('starts a druid with no realm at all', () => {
    expect(initialRealmFor({})).toBe(REALM_SENTINEL_SLUG);
    expect(initialRealmFor(undefined)).toBe(REALM_SENTINEL_SLUG);
  });

  it('keeps an agent out of its realm when it has explicitly left', () => {
    // The defect: boundRealmId-first put this agent back into launch-visibility
    // for the session, and session state then beat its own sentinel.
    expect(initialRealmFor({ currentRealmId: 'default', boundRealmId: 'launch-visibility' }))
      .toBe(REALM_SENTINEL_SLUG);
  });

  it('prefers where the agent currently is over where it is bound', () => {
    expect(initialRealmFor({ currentRealmId: 'ets', boundRealmId: 'launch-visibility' })).toBe('ets');
  });

  it('treats a differently-cased sentinel as the sentinel', () => {
    // Every other sentinel test lowercases first; this one used a literal
    // comparison, so 'Default' was a realm here and the sentinel everywhere else.
    expect(initialRealmFor({ currentRealmId: 'Default', boundRealmId: 'ets' }))
      .toBe(REALM_SENTINEL_SLUG);
    expect(initialRealmFor({ currentRealmId: 'DEFAULT' })).toBe(REALM_SENTINEL_SLUG);
  });

  it('canonicalises the sentinel to lower case', () => {
    // So downstream comparisons that test the literal still behave.
    expect(initialRealmFor({ currentRealmId: 'Default' })).toBe(REALM_SENTINEL_SLUG);
  });

  it('does not mistake a realm merely starting with "default" for the sentinel', () => {
    expect(initialRealmFor({ currentRealmId: 'default-realm' })).toBe('default-realm');
    expect(isRealmSentinel('default-realm')).toBe(false);
  });

  describe('realmsVisited', () => {
    it('records a real starting realm', () => {
      expect(realmsVisitedFor('ets')).toEqual(['ets']);
    });

    it('records nothing when the agent starts in no realm', () => {
      expect(realmsVisitedFor(REALM_SENTINEL_SLUG)).toEqual([]);
    });

    it('records nothing for a differently-cased sentinel', () => {
      expect(realmsVisitedFor('Default')).toEqual([]);
    });
  });
});
