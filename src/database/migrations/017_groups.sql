-- Migration 017: groups (IdP-sourced membership, Druids-managed grants)
--
-- Group membership comes from the OIDC `groups` claim, synced on each login;
-- group->druid grants are managed in Druids (admin UI). A user's effective
-- assumable set = their direct grants UNION the grants of the groups they
-- belong to (docs/identity-and-access-control.md).
--
--   groups                  — discovery cache of group keys we've seen (at login)
--                             or that have been granted, so the UI can list them.
--   user_group_memberships  — a user's current groups, replace-synced at login.
--   group_assumable_druids  — group -> druid grants (managed in Druids).
--
-- group_key is the IdP claim value (a free string, like a realm/agent slug); it
-- is intentionally NOT a FK so a group may be granted before it is first seen,
-- and membership sync never blocks on grant ordering. druid_id is the agent
-- slug id (matches user_assumable_druids; see migration 016).
--
-- Rollback:
--   DROP TABLE druids_core.group_assumable_druids;
--   DROP TABLE druids_core.user_group_memberships;
--   DROP TABLE druids_core.groups;

BEGIN;

CREATE TABLE IF NOT EXISTS druids_core.groups (
  group_key     VARCHAR(255) PRIMARY KEY,
  display_name  VARCHAR(255),
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE druids_core.groups IS
  'Discovery cache of group keys (from OIDC group claims or grants) so the admin UI can list groups. Not the source of truth for membership.';

CREATE TABLE IF NOT EXISTS druids_core.user_group_memberships (
  user_id    UUID NOT NULL REFERENCES druids_core.users(id) ON DELETE CASCADE,
  group_key  VARCHAR(255) NOT NULL,
  synced_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, group_key)
);

CREATE INDEX IF NOT EXISTS idx_user_group_memberships_group
  ON druids_core.user_group_memberships(group_key);

COMMENT ON TABLE druids_core.user_group_memberships IS
  'A user''s groups, replace-synced from the OIDC groups claim at each login.';

CREATE TABLE IF NOT EXISTS druids_core.group_assumable_druids (
  group_key   VARCHAR(255) NOT NULL,
  druid_id    VARCHAR(255) NOT NULL,
  granted_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  granted_by  UUID REFERENCES druids_core.users(id) ON DELETE SET NULL,
  PRIMARY KEY (group_key, druid_id)
);

CREATE INDEX IF NOT EXISTS idx_group_assumable_druids_group
  ON druids_core.group_assumable_druids(group_key);

COMMENT ON TABLE druids_core.group_assumable_druids IS
  'Group -> druid assumption grants (managed in Druids). A user inherits these for every group they belong to.';

COMMIT;
