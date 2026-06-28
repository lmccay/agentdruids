import session from 'express-session';
import { RequestHandler } from 'express';

/**
 * Session middleware backed by the existing Redis instance (connect-redis).
 * Stores the authenticated human session and the transient OIDC handshake
 * state. Falls back to the in-memory store only if Redis is unavailable, so a
 * misconfigured cache degrades rather than crashes the app at boot.
 */
export async function buildSessionMiddleware(): Promise<RequestHandler> {
  const secret = (process.env['SESSION_SECRET'] || '').trim() || 'druids-dev-session-secret';

  const baseOptions: session.SessionOptions = {
    secret,
    resave: false,
    saveUninitialized: false,
    name: 'druids.sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // Dev runs over http; set OIDC_COOKIE_SECURE=true behind TLS in prod.
      secure: (process.env['OIDC_COOKIE_SECURE'] || '').toLowerCase() === 'true',
      maxAge: 8 * 60 * 60 * 1000, // 8h
    },
  };

  try {
    const { createClient } = await import('redis');
    const { default: RedisStore } = await import('connect-redis');
    const url = process.env['REDIS_URL'] || 'redis://localhost:6379';
    const client = createClient({ url });
    client.on('error', (err: unknown) => console.error('⚠️  Session Redis error:', err));
    await client.connect();
    const store = new RedisStore({ client, prefix: 'druids:sess:' });
    console.log('🔐 Session store: Redis');
    return session({ ...baseOptions, store });
  } catch (error) {
    console.warn('⚠️  Session store falling back to in-memory (Redis unavailable):', error);
    return session(baseOptions);
  }
}
