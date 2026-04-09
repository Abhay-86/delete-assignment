import { Router } from 'express';

export const healthRouter = Router();

const startedAt = Date.now();

/**
 * GET /api/health
 *
 * Simple liveness / readiness probe.  Returns the current server status,
 * an ISO-8601 timestamp, and uptime in seconds.
 */
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  });
});
