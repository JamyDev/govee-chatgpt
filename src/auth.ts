import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { AuthConfig } from './config.js';
export type Identity = { subject: string; scopes: string[] };
export type VerifyToken = (token: string) => Promise<Identity>;
export function tokenVerifier(config: AuthConfig, keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(config.jwksUrl), { timeoutDuration: 5000, cooldownDuration: 30000 })): VerifyToken {
  return async token => {
    const { payload } = await jwtVerify(token, keys, {
      issuer: config.issuer, audience: config.resource,
      algorithms: ['RS256', 'ES256'], requiredClaims: ['exp', 'sub', 'iat'], clockTolerance: 5,
    });
    if (!payload.sub || !config.subjects.includes(payload.sub)) throw new Error('Unauthorized identity');
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean) : [];
    return { subject: payload.sub, scopes };
  };
}
export function challenge(config: AuthConfig, scope = 'govee:read'): string {
  const url = new URL('/.well-known/oauth-protected-resource/mcp', config.resource);
  return `Bearer resource_metadata="${url}", scope="${scope}"`;
}
