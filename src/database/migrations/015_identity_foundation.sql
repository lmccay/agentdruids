-- Migration 015: Identity foundation (users, roles, assumable druids)
--
-- The foundation layer from docs/identity-and-access-control.md. Introduces a
-- human/operator identity, distinct from agent identity, on which the
-- control-plane (admin) vs. data-plane (user) authorization split is built.
--
--   users                 — a human principal, keyed by OIDC (issuer + subject).
--   user_roles            — additive roles. Phase 1 uses 'admin' and 'user';
--                           the set is extensible (the AccessControl.ts
--                           Role/Permission types are the finer-RBAC target).
--   user_assumable_druids — the ONLY new per-user data-plane grant: which druids
--                           a user may assume. A user's realm/tool reach is
--                           DERIVED from these druids' realmAccess/resourceAccess
--                           (no parallel per-user grant matrix).
--
-- Identity is keyed on (oidc_issuer, oidc_subject) so the issuer is pluggable
-- (bundled dev IdP, Google, enterprise, KnoxIDF) without subject collisions
-- across providers. This migration creates schema only — authentication,
-- env-seeded first admin, and enforcement arrive in later Phase 1 slices.
--
-- Rollback:
--   DROP TABLE druids_core.user_assumable_druids;
--   DROP TABLE druids_core.user_roles;
--   DROP TABLE druids_core.users;

BEGIN;

CREATE TABLE IF NOT EXISTS druids_core.users (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oidc_issuer      VARCHAR(512) NOT NULL,
  oidc_subject     VARCHAR(255) NOT NULL,
  email            VARCHAR(320),
  display_name     VARCHAR(255),
  status           VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login_at    TIMESTAMP WITH TIME ZONE,
  CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT uq_users_issuer_subject UNIQUE (oidc_issuer, oidc_subject)
);

-- Email lookup supports env-seeded first-admin matching by email.
CREATE INDEX IF NOT EXISTS idx_users_email ON druids_core.users(LOWER(email));

COMMENT ON TABLE druids_core.users IS
  'Human/operator principals, keyed by pluggable OIDC (issuer, subject). Distinct from agent identity. See docs/identity-and-access-control.md.';

CREATE TABLE IF NOT EXISTS druids_core.user_roles (
  user_id     UUID NOT NULL REFERENCES druids_core.users(id) ON DELETE CASCADE,
  role        VARCHAR(32) NOT NULL,
  granted_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  granted_by  UUID REFERENCES druids_core.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role),
  CONSTRAINT user_roles_role_check CHECK (role IN ('admin', 'user'))
);

COMMENT ON TABLE druids_core.user_roles IS
  'Additive roles per user. Phase 1: admin (control plane) and user (data plane). CHECK widens as RBAC grows.';

CREATE TABLE IF NOT EXISTS druids_core.user_assumable_druids (
  user_id     UUID NOT NULL REFERENCES druids_core.users(id) ON DELETE CASCADE,
  druid_id    UUID NOT NULL REFERENCES druids_core.agents(id) ON DELETE CASCADE,
  granted_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  granted_by  UUID REFERENCES druids_core.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, druid_id)
);

CREATE INDEX IF NOT EXISTS idx_assumable_druids_user
  ON druids_core.user_assumable_druids(user_id);

COMMENT ON TABLE druids_core.user_assumable_druids IS
  'Which druids a user may assume. A user''s data-plane reach is derived from these druids'' realmAccess/resourceAccess (union). The only new per-user authorization decision.';

COMMIT;
