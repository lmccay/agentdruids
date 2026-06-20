import express from 'express';

/**
 * Session outcomes ingestion API — RESERVED FOR PHASE F.
 *
 * Phase A (read-only WorldTree discovery) does not implement outcome ingestion.
 * This stub exists to reserve the route path and document the intended surface
 * so Phase F can drop in without churn. See docs/phase-a-worldtree-discovery.md
 * ("Forward-compatibility: success metrics").
 *
 * Planned endpoints (Phase F):
 *   POST /api/sessions/{sessionId}/outcomes  — record a single measurement
 *   POST /api/outcomes/batch                 — bulk import (e.g. analytics CSV)
 *   POST /api/outcomes/webhooks/{source}     — per-source webhook handlers
 *
 * Backing table (Phase F migration 008): druids_core.session_outcomes.
 *
 * TODO(phase-f): implement ingestion, wire to a SessionOutcomeService, and
 * surface outcomes via the existing forward-compatible WorldTree fields
 * (get_session.outcomes, list_sessions.hasOutcomes, worldtree_health.outcomesAttachedCount).
 */

const router = express.Router();

// Intentionally no routes yet — Phase F.

export default router;
