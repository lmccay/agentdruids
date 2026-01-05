import { Request, Response, NextFunction } from 'express';

/**
 * Health check middleware
 */
export function healthCheck(req: Request, res: Response, next: NextFunction): void {
  // Basic health check endpoint
  if (req.path === '/health' || req.path === '/') {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      environment: process.env['NODE_ENV'] || 'development'
    });
    return;
  }
  
  next();
}