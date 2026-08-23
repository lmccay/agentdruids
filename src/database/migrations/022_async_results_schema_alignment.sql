-- Migration 022: align async_results with the model the application writes
--
-- Part of making async result persistence work at all (#90). The table and the
-- code that writes it have never agreed, and because every write failure was
-- swallowed, the table has stayed empty since it was created.
--
-- The application models progress as an object, and returns it that way from
-- the async result API:
--
--   progress?: { current: number; total: number; message?: string }
--
-- The column was an INTEGER constrained to 0..100, so `JSON.stringify(progress)`
-- could never be stored. Rather than flatten the model to a percentage — which
-- would lose `message` and the current/total pair the API exposes, and would
-- read back as the wrong type — the column is widened to match what the
-- application actually has.
--
-- The 0..100 CHECK goes with it; range is no longer meaningful for an object,
-- and `current`/`total` carry that information directly.
--
-- The table is empty, so the type change is safe and no data is reinterpreted.
--
-- Other columns are deliberately NOT changed here. The code's references to
-- `result_data`, `created_at` and `updated_at` are the code being wrong, not the
-- schema: `result`, `started_at` and `completed_at` are the better model, and
-- the queries are corrected to use them instead.
--
-- Rollback (only valid while the table remains empty):
--   ALTER TABLE druids_core.async_results
--     ALTER COLUMN progress TYPE INTEGER USING NULL,
--     ADD CONSTRAINT async_results_progress_check
--       CHECK (progress >= 0 AND progress <= 100);

BEGIN;

ALTER TABLE druids_core.async_results
  DROP CONSTRAINT IF EXISTS async_results_progress_check;

ALTER TABLE druids_core.async_results
  ALTER COLUMN progress DROP DEFAULT;

ALTER TABLE druids_core.async_results
  ALTER COLUMN progress TYPE JSONB USING to_jsonb(progress);

COMMENT ON COLUMN druids_core.async_results.progress IS
  'Progress object as modelled by AsyncResultManager: { current, total, message? }. NULL once the request reaches a terminal status.';

-- The status CHECK never matched the application either. It allowed
-- 'running' and 'cancelled', which the code never produces, and rejected
-- 'processing' and 'expired', which it does — so even a correctly named INSERT
-- would have been refused for an in-flight or aged-out request.
--
-- AsyncResultStatus is the authority here:
--   'pending' | 'processing' | 'completed' | 'failed' | 'expired'
ALTER TABLE druids_core.async_results
  DROP CONSTRAINT IF EXISTS async_results_status_check;

ALTER TABLE druids_core.async_results
  ADD CONSTRAINT async_results_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired'));

COMMIT;
