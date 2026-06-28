import { Router, Request, Response } from 'express';
import { generators } from 'openid-client';
import { getOidcClient, getRedirectUri } from './oidc';
import { identityService } from '../services/IdentityService';

/**
 * OIDC Authorization Code + PKCE login flow for the human console.
 *   GET  /auth/login    → redirect to the IdP
 *   GET  /auth/callback → exchange code, upsert user, establish session
 *   POST /auth/logout   → destroy session
 *   GET  /auth/me       → current principal (or 401)
 */
const router = Router();

const POST_LOGIN_REDIRECT = process.env['OIDC_POST_LOGIN_REDIRECT'] || '/';

router.get('/login', async (req: Request, res: Response) => {
  try {
    const client = await getOidcClient();
    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    req.session.oidc = { state, nonce, codeVerifier };

    const url = client.authorizationUrl({
      scope: 'openid email profile groups',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    res.redirect(url);
  } catch (error) {
    console.error('OIDC login error:', error);
    res.status(500).json({ error: 'Login failed', message: 'Could not initiate OIDC login' });
  }
});

router.get('/callback', async (req: Request, res: Response) => {
  const handshake = req.session.oidc;
  if (!handshake) {
    res.status(400).json({ error: 'Invalid state', message: 'No login in progress' });
    return;
  }
  try {
    const client = await getOidcClient();
    const params = client.callbackParams(req);
    const tokenSet = await client.callback(getRedirectUri(), params, {
      state: handshake.state,
      nonce: handshake.nonce,
      code_verifier: handshake.codeVerifier,
    });
    const claims = tokenSet.claims();

    const groupsClaim = claims['groups'];
    const user = await identityService.upsertOnLogin({
      issuer: claims.iss,
      subject: claims.sub,
      email: (claims['email'] as string | undefined) ?? null,
      name: (claims['name'] as string | undefined) ?? null,
      groups: Array.isArray(groupsClaim) ? (groupsClaim as string[]) : null,
    });

    // Establish the authenticated session; clear transient handshake state.
    delete req.session.oidc;
    req.session.userId = user.id;
    req.session.roles = user.roles;

    res.redirect(POST_LOGIN_REDIRECT);
  } catch (error) {
    console.error('OIDC callback error:', error);
    delete req.session.oidc;
    res.status(401).json({ error: 'Authentication failed', message: 'OIDC callback rejected' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    res.clearCookie('druids.sid');
    res.json({ success: true });
  });
});

router.get('/me', async (req: Request, res: Response) => {
  if (!req.principal || req.principal.service || !req.principal.userId) {
    res.status(401).json({ authenticated: false });
    return;
  }
  const user = await identityService.getUserById(req.principal.userId);
  if (!user) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles,
      groups: user.groups,
    },
  });
});

export default router;
