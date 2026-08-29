/**
 * Corpus-search realm scoping — the pure decision behind in-session RAG scope.
 *
 * Extracted from AgentService.toolSearchWorldtree so the isolation guarantee
 * (a session's research scope never leaks another realm's corpus, and an agent
 * can never search outside its grants) is testable without standing up the full
 * AgentService/DB stack. `global` is always implicit at the query layer; this
 * returns only the *additional* realms to scope to.
 */

import { isRealmSentinel } from '../utils/uuidUtils';

export interface SearchScopeInputs {
  /** Realms this agent may access (its realm grants collapsed to ids). */
  accessibleRealms: string[];
  /** The session's declared research realms (campaign scope); [] / omit if none. */
  sessionResearchRealms?: string[] | undefined;
  /** The realm the agent is currently present in; null/sentinel => not present. */
  currentRealm?: string | null | undefined;
  /** Realms the caller requested explicitly on the tool call. */
  explicitRealms?: string[] | undefined;
}

/**
 * Resolve the realm scope (in addition to the always-implicit global corpus).
 *
 * Sources, all intersected with `accessibleRealms` so an agent can never reach a
 * realm outside its grants — except `currentRealm`, which is inherently the
 * agent's own presence (an elemental's bound realm, or where a druid traveled):
 *   1. session research realms — the late-bound campaign scope
 *   2. current realm — where the agent is present
 *   3. explicit realms — requested on the call
 *
 * Empty result => global-only (the safe default; we do NOT fall back to the
 * agent's entire accessible set, which would leak unrelated realms' corpora).
 */
export function resolveSearchScope(inputs: SearchScopeInputs): string[] {
  const accessible = new Set(inputs.accessibleRealms.map((r) => String(r)));
  const scope = new Set<string>();

  for (const r of inputs.sessionResearchRealms ?? []) {
    const id = String(r);
    if (accessible.has(id)) scope.add(id);
  }

  const current = inputs.currentRealm;
  if (current && !isRealmSentinel(current)) scope.add(String(current));

  for (const r of inputs.explicitRealms ?? []) {
    const id = String(r);
    if (accessible.has(id)) scope.add(id);
  }

  return Array.from(scope);
}
