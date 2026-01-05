import { Request, Response, NextFunction } from 'express';

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  
  // Log request start
  console.log(`📥 ${timestamp} ${req.method} ${req.path} - ${req.ip}`);
  
  // Log additional details in development
  if (process.env['NODE_ENV'] !== 'production') {
    if (Object.keys(req.query).length > 0) {
      console.log(`   Query: ${JSON.stringify(req.query)}`);
    }
    if (req.headers['user-agent']) {
      console.log(`   User-Agent: ${req.headers['user-agent']}`);
    }
  }

  // Use res.on('finish') to log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '🔴' : res.statusCode >= 300 ? '🟡' : '🟢';
    console.log(`📤 ${timestamp} ${req.method} ${req.path} - ${statusColor} ${res.statusCode} (${duration}ms)`);
  });

  next();
}