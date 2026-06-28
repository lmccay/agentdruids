import { DatabaseService } from './DatabaseService';
import { User, UserRole, AssumableDruidGrant } from '../models/User';
import { UserId, AgentId } from '../models/Types';

/**
 * IdentityService — persistence for human/operator identity (migration 015).
 *
 * Owns the user lifecycle keyed by pluggable OIDC (issuer + subject), additive
 * roles, and the assumable-druids grant. The authorization decisions built on
 * this (control-plane admin gate, data-plane assume-gate) live in later slices.
 */
export class IdentityService {
  private db: DatabaseService;
  /** OIDC subject OR email that is granted admin on first login (break-glass). */
  private adminMatch: string;

  constructor() {
    this.db = DatabaseService.getInstance();
    this.adminMatch = (process.env['ADMIN_OIDC_SUBJECT'] || '').trim().toLowerCase();
  }

  /**
   * Upsert a user from verified OIDC claims at login and return them with roles.
   * Every authenticated principal gets the `user` role; the env-seeded admin
   * (matched by subject or email) additionally gets `admin`.
   */
  async upsertOnLogin(claims: {
    issuer: string;
    subject: string;
    email?: string | null;
    name?: string | null;
    groups?: string[] | null;
  }): Promise<User> {
    const email = claims.email ?? null;
    const name = claims.name ?? null;

    const result = await this.db.query(
      `INSERT INTO druids_core.users (oidc_issuer, oidc_subject, email, display_name, last_login_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (oidc_issuer, oidc_subject) DO UPDATE SET
         email = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         last_login_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [claims.issuer, claims.subject, email, name]
    );
    const userId = result.rows[0]['id'] as UserId;

    // Every authenticated user holds the data-plane `user` role.
    await this.grantRole(userId, 'user');

    // First-admin break-glass: subject or email matches the env-seeded admin.
    if (this.adminMatch) {
      const subjectMatch = claims.subject.toLowerCase() === this.adminMatch;
      const emailMatch = !!email && email.toLowerCase() === this.adminMatch;
      if (subjectMatch || emailMatch) {
        await this.grantRole(userId, 'admin');
      }
    }

    // Sync group membership from the OIDC groups claim (replace-semantics).
    await this.syncUserGroups(userId, Array.isArray(claims.groups) ? claims.groups : []);

    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User vanished immediately after upsert');
    }
    return user;
  }

  /** Idempotently grant a role (self-granted at login; granted_by null). */
  private async grantRole(userId: UserId, role: UserRole, grantedBy?: UserId): Promise<void> {
    await this.db.query(
      `INSERT INTO druids_core.user_roles (user_id, role, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId, role, grantedBy ?? null]
    );
  }

  async getUserById(userId: UserId): Promise<User | null> {
    const result = await this.db.query(
      `SELECT id, oidc_issuer, oidc_subject, email, display_name, status,
              created_at, updated_at, last_login_at
       FROM druids_core.users WHERE id = $1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return null;

    const [roles, groups] = await Promise.all([this.getRoles(userId), this.getUserGroups(userId)]);
    return {
      id: row['id'],
      oidcIssuer: row['oidc_issuer'],
      oidcSubject: row['oidc_subject'],
      email: row['email'] ?? null,
      displayName: row['display_name'] ?? null,
      status: row['status'],
      roles,
      groups,
      createdAt: row['created_at'],
      updatedAt: row['updated_at'],
      lastLoginAt: row['last_login_at'] ?? null,
    };
  }

  async getRoles(userId: UserId): Promise<UserRole[]> {
    const result = await this.db.query(
      `SELECT role FROM druids_core.user_roles WHERE user_id = $1 ORDER BY role`,
      [userId]
    );
    return result.rows.map((r) => r['role'] as UserRole);
  }

  /**
   * The druids a user may assume. A user's data-plane reach is derived from the
   * union of these druids' realmAccess/resourceAccess (enforced in a later slice).
   */
  async listAssumableDruids(userId: UserId): Promise<AssumableDruidGrant[]> {
    const result = await this.db.query(
      `SELECT user_id, druid_id, granted_at, granted_by
       FROM druids_core.user_assumable_druids WHERE user_id = $1`,
      [userId]
    );
    return result.rows.map((r) => ({
      userId: r['user_id'],
      druidId: r['druid_id'] as AgentId,
      grantedAt: r['granted_at'],
      grantedBy: r['granted_by'] ?? null,
    }));
  }

  /**
   * Whether a user may assume a specific druid — the data-plane assume-gate
   * check. Effective set = the user's direct grants UNION the grants of every
   * group they belong to.
   */
  async isDruidAssumable(userId: UserId, druidId: AgentId): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM druids_core.user_assumable_druids
        WHERE user_id = $1 AND druid_id = $2
       UNION ALL
       SELECT 1 FROM druids_core.group_assumable_druids g
         JOIN druids_core.user_group_memberships m ON m.group_key = g.group_key
        WHERE m.user_id = $1 AND g.druid_id = $2
       LIMIT 1`,
      [userId, druidId]
    );
    return result.rows.length > 0;
  }

  /**
   * Whether a user may drive a druid — admins are unconstrained, otherwise the
   * effective assumable set applies. The tool-layer equivalent of the REST
   * assume-gate (which reads roles from the session); here roles are fetched.
   */
  async mayAssumeDruid(userId: UserId, druidId: AgentId): Promise<boolean> {
    const roles = await this.getRoles(userId);
    if (roles.includes('admin')) return true;
    return this.isDruidAssumable(userId, druidId);
  }

  /** Replace a user's group membership from the OIDC groups claim (login sync). */
  async syncUserGroups(userId: UserId, groupKeys: string[]): Promise<void> {
    const unique = Array.from(new Set(groupKeys.filter((g) => typeof g === 'string' && g.length > 0)));
    await this.db.query(`DELETE FROM druids_core.user_group_memberships WHERE user_id = $1`, [userId]);
    for (const key of unique) {
      // Discovery cache so the admin UI can list groups, then the membership.
      await this.db.query(
        `INSERT INTO druids_core.groups (group_key) VALUES ($1) ON CONFLICT (group_key) DO NOTHING`,
        [key]
      );
      await this.db.query(
        `INSERT INTO druids_core.user_group_memberships (user_id, group_key) VALUES ($1, $2)
         ON CONFLICT (user_id, group_key) DO NOTHING`,
        [userId, key]
      );
    }
  }

  /** The groups a user currently belongs to (synced at last login). */
  async getUserGroups(userId: UserId): Promise<string[]> {
    const result = await this.db.query(
      `SELECT group_key FROM druids_core.user_group_memberships WHERE user_id = $1 ORDER BY group_key`,
      [userId]
    );
    return result.rows.map((r) => r['group_key'] as string);
  }

  /** Known groups (discovery cache) for the admin UI. */
  async listGroups(): Promise<Array<{ groupKey: string; displayName: string | null }>> {
    const result = await this.db.query(
      `SELECT group_key, display_name FROM druids_core.groups ORDER BY group_key`
    );
    return result.rows.map((r) => ({ groupKey: r['group_key'], displayName: r['display_name'] ?? null }));
  }

  /** Druids a group may assume. */
  async listGroupAssumableDruids(groupKey: string): Promise<AssumableDruidGrant[]> {
    const result = await this.db.query(
      `SELECT group_key, druid_id, granted_at, granted_by
       FROM druids_core.group_assumable_druids WHERE group_key = $1`,
      [groupKey]
    );
    return result.rows.map((r) => ({
      userId: r['group_key'], // grant scoped to a group, not a user
      druidId: r['druid_id'] as AgentId,
      grantedAt: r['granted_at'],
      grantedBy: r['granted_by'] ?? null,
    }));
  }

  /** Grant a group the ability to assume a druid (admin/control-plane action). */
  async grantGroupAssumableDruid(groupKey: string, druidId: AgentId, grantedBy?: UserId): Promise<void> {
    await this.db.query(
      `INSERT INTO druids_core.groups (group_key) VALUES ($1) ON CONFLICT (group_key) DO NOTHING`,
      [groupKey]
    );
    await this.db.query(
      `INSERT INTO druids_core.group_assumable_druids (group_key, druid_id, granted_by)
       VALUES ($1, $2, $3) ON CONFLICT (group_key, druid_id) DO NOTHING`,
      [groupKey, druidId, grantedBy ?? null]
    );
  }

  /** Revoke a group's ability to assume a druid. Returns false if no grant existed. */
  async revokeGroupAssumableDruid(groupKey: string, druidId: AgentId): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM druids_core.group_assumable_druids WHERE group_key = $1 AND druid_id = $2`,
      [groupKey, druidId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Grant a user the ability to assume a druid (admin/control-plane action). */
  async grantAssumableDruid(userId: UserId, druidId: AgentId, grantedBy?: UserId): Promise<void> {
    await this.db.query(
      `INSERT INTO druids_core.user_assumable_druids (user_id, druid_id, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, druid_id) DO NOTHING`,
      [userId, druidId, grantedBy ?? null]
    );
  }

  /** Revoke a user's ability to assume a druid. Returns false if no grant existed. */
  async revokeAssumableDruid(userId: UserId, druidId: AgentId): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM druids_core.user_assumable_druids WHERE user_id = $1 AND druid_id = $2`,
      [userId, druidId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** List users with their roles (admin console / grant management). */
  async listUsers(): Promise<User[]> {
    const result = await this.db.query(
      `SELECT id FROM druids_core.users ORDER BY created_at`
    );
    const users = await Promise.all(result.rows.map((r) => this.getUserById(r['id'] as UserId)));
    return users.filter((u): u is User => u !== null);
  }
}

export const identityService = new IdentityService();
