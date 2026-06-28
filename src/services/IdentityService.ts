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

    const roles = await this.getRoles(userId);
    return {
      id: row['id'],
      oidcIssuer: row['oidc_issuer'],
      oidcSubject: row['oidc_subject'],
      email: row['email'] ?? null,
      displayName: row['display_name'] ?? null,
      status: row['status'],
      roles,
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
}

export const identityService = new IdentityService();
