import { UserId, AgentId, Timestamp } from './Types';

/**
 * Human/operator identity models — the foundation layer from
 * docs/identity-and-access-control.md. Distinct from agent identity: a User is
 * a human principal authenticated via (pluggable) OIDC, on which the
 * control-plane (admin) vs. data-plane (user) authorization split is built.
 *
 * Phase 1 schema only mirrors what migration 015 persists. Finer RBAC later
 * grows out of the AccessControl.ts Role/Permission types.
 */

/**
 * Roles are additive. Phase 1 distinguishes the control plane (admin) from the
 * data plane (user); the set widens as RBAC matures (mirrors the user_roles
 * CHECK constraint in migration 015).
 */
export type UserRole = 'admin' | 'user';

export interface UserStatus {
  status: 'active' | 'inactive';
}

/**
 * A human principal, keyed by OIDC (issuer + subject) so the issuer stays
 * pluggable across providers without subject collisions.
 */
export interface User {
  id: UserId;
  /** OIDC issuer URL — part of the identity key (pluggable provider). */
  oidcIssuer: string;
  /** OIDC `sub` claim — unique within an issuer. */
  oidcSubject: string;
  email: string | null;
  displayName: string | null;
  status: 'active' | 'inactive';
  /** Additive roles held by this user (e.g. ['user'], ['admin', 'user']). */
  roles: UserRole[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt: Timestamp | null;
}

/**
 * A grant that a user may assume a given druid. The only new per-user
 * data-plane authorization decision — a user's realm/tool reach is *derived*
 * from the union of their assumable druids' realmAccess/resourceAccess.
 */
export interface AssumableDruidGrant {
  userId: UserId;
  druidId: AgentId;
  grantedAt: Timestamp;
  /** The admin who granted this assumption, if recorded. */
  grantedBy: UserId | null;
}

/** The identity an authenticated request resolves to (populated by the auth layer in a later slice). */
export interface AuthenticatedPrincipal {
  userId: UserId;
  roles: UserRole[];
}
