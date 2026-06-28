import { Issuer, Client, IssuerMetadata } from 'openid-client';

/**
 * OIDC relying-party setup. The issuer is pluggable (docs/identity-and-access-
 * control.md): dev uses the bundled Dex container, prod points OIDC_ISSUER at
 * any provider (Google, enterprise, KnoxIDF).
 *
 * Docker back-channel: the browser reaches the IdP at the public issuer
 * (OIDC_ISSUER, e.g. localhost:5556), but the backend must reach the
 * token/jwks/userinfo endpoints over the Docker network. When
 * OIDC_INTERNAL_ISSUER is set, we discover against it and rewrite only the
 * back-channel endpoints to the internal base, leaving the issuer string and
 * the browser-facing authorization endpoint on the public host so the ID token
 * `iss` still validates. In prod OIDC_INTERNAL_ISSUER is unset → no rewrite.
 */

let cachedClient: Client | null = null;

function rewriteBase(url: string | undefined, fromBase: string, toBase: string): string | undefined {
  if (!url) return url;
  return url.startsWith(fromBase) ? toBase + url.slice(fromBase.length) : url;
}

export async function getOidcClient(): Promise<Client> {
  if (cachedClient) return cachedClient;

  const publicIssuer = required('OIDC_ISSUER');
  const internalIssuer = (process.env['OIDC_INTERNAL_ISSUER'] || '').trim();
  const clientId = required('OIDC_CLIENT_ID');
  const clientSecret = required('OIDC_CLIENT_SECRET');
  const redirectUri = required('OIDC_REDIRECT_URI');

  // Discover against whichever issuer the backend can actually reach.
  const discoveryTarget = internalIssuer || publicIssuer;
  const discovered = await Issuer.discover(discoveryTarget);
  const meta = discovered.metadata;

  let issuer = discovered;
  if (internalIssuer && internalIssuer !== publicIssuer) {
    // Discovery (fetched from the internal host) reports public-host endpoints.
    // Keep issuer + authorization_endpoint public (browser-facing, iss check);
    // rewrite back-channel endpoints to the internal base (container-reachable).
    // Conditional spreads omit undefined keys cleanly (exactOptionalPropertyTypes).
    const tokenEp = rewriteBase(meta.token_endpoint, publicIssuer, internalIssuer);
    const jwksUri = rewriteBase(meta.jwks_uri, publicIssuer, internalIssuer);
    const userinfoEp = rewriteBase(meta.userinfo_endpoint, publicIssuer, internalIssuer);
    const metadata: IssuerMetadata = {
      issuer: publicIssuer,
      ...(meta.authorization_endpoint !== undefined && { authorization_endpoint: meta.authorization_endpoint }),
      ...(tokenEp !== undefined && { token_endpoint: tokenEp }),
      ...(jwksUri !== undefined && { jwks_uri: jwksUri }),
      ...(userinfoEp !== undefined && { userinfo_endpoint: userinfoEp }),
      ...(meta.end_session_endpoint !== undefined && { end_session_endpoint: meta.end_session_endpoint }),
    };
    issuer = new Issuer(metadata);
  }

  cachedClient = new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: [redirectUri],
    response_types: ['code'],
  });
  return cachedClient;
}

export function getRedirectUri(): string {
  return required('OIDC_REDIRECT_URI');
}

function required(name: string): string {
  const v = (process.env[name] || '').trim();
  if (!v) throw new Error(`Missing required OIDC env var: ${name}`);
  return v;
}
