/**
 * Realm field shaping for outbound payloads.
 *
 * Deliberately side-effect free, and deliberately not in `src/api/`. Importing
 * an api module pulls in `authorize` -> `SharedServices`, which constructs
 * AgentService and RealmService at module load and opens a database connection —
 * so a test of this decision would connect to Postgres to check a string.
 */

import { isRealmSentinel } from './uuidUtils';

/**
 * Shape the `realmId` field of an agent payload, omitting it when the agent is
 * in no realm.
 *
 * These responses used to emit the literal `'default-realm'` for absence. Under
 * UUID identity that was unambiguously not a realm id, because no realm could
 * ever be called that. Under slug identity (migrations 020 and 021) it is a
 * well-formed slug — and precisely the slug a realm named "Default Realm" would
 * receive — so a consumer could no longer tell "this agent has no realm" from
 * "this agent is in the Default Realm".
 *
 * Absence is expressed by omission, which is what `resolveCurrentRealm` already
 * treats as absence and what a naive consumer handles correctly: `if
 * (agent.realmId)` does the right thing, where a placeholder would send it
 * looking up a realm that cannot exist. The reserved `'default'` sentinel is
 * used only where a value is structurally required — `AgentDeployment.realmId` —
 * and is treated as absence here.
 */
export function realmIdField(realmId: string | null | undefined): { realmId?: string } {
  return !realmId || isRealmSentinel(realmId) ? {} : { realmId };
}
