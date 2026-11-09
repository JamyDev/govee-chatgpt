import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { tokenVerifier } from '../src/auth.js';
import { readConfig, type AuthConfig } from '../src/config.js';
const auth: AuthConfig = { issuer: 'https://issuer.example', jwksUrl: 'https://issuer.example/jwks', resource: 'https://mcp.example/mcp', subjects: ['owner'] };
const { privateKey, publicKey } = await generateKeyPair('RS256');
const key = await exportJWK(publicKey); key.kid = 'test';
const verify = tokenVerifier(auth, createLocalJWKSet({ keys: [key] }));
async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ scope: 'govee:read govee:control', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(String(overrides.iss ?? auth.issuer))
    .setAudience(String(overrides.aud ?? auth.resource)).setSubject(String(overrides.sub ?? 'owner'))
    .setIssuedAt().setExpirationTime(overrides.exp as number ?? '5m').sign(privateKey);
}
test('JWT validates exact issuer, audience, expiry and household identity', async () => {
  assert.deepEqual(await verify(await token()), { subject: 'owner', scopes: ['govee:read', 'govee:control'] });
  for (const override of [{ iss: 'https://other.example' }, { aud: 'wrong' }, { sub: 'other-user' }, { exp: 1 }])
    await assert.rejects(verify(await token(override)));
  await assert.rejects(verify('not-a-token'));
});
test('read-only tokens remain read-only', async () => { assert.deepEqual((await verify(await token({ scope: 'govee:read' }))).scopes, ['govee:read']); });
test('safe defaults and fail-closed config', () => {
  assert.equal(readConfig({}).mode, 'demo'); assert.equal(readConfig({}).host, '127.0.0.1');
  assert.throws(() => readConfig({ GOVEE_MODE: 'live' }), /requires GOVEE_API_KEY/);
  assert.throws(() => readConfig({ GOVEE_MODE: 'live', GOVEE_API_KEY: 'test' }), /requires OAuth/);
  assert.throws(() => readConfig({ HOST: '0.0.0.0' }), /loopback/);
  assert.throws(() => readConfig({ OAUTH_ISSUER: 'https://issuer.example' }), /SUBJECTS/);
  assert.throws(() => readConfig({ PORT: '0' }), /Invalid/);
  assert.equal(readConfig({ GOVEE_MODE: 'live', GOVEE_API_KEY: 'test', MCP_TRANSPORT: 'stdio' }).transport, 'stdio');
});
test('OAuth config rejects insecure or credential-bearing URLs', () => {
  const env = { OAUTH_ISSUER: auth.issuer, OAUTH_JWKS_URL: auth.jwksUrl, MCP_RESOURCE_URL: auth.resource, OAUTH_ALLOWED_SUBJECTS: 'owner' };
  assert.deepEqual(readConfig(env).auth, auth);
  for (const url of ['http://mcp.example/mcp', 'https://user:pass@mcp.example/mcp', 'https://mcp.example/mcp?secret=a', 'https://mcp.example/mcp/'])
    assert.throws(() => readConfig({ ...env, MCP_RESOURCE_URL: url }));
});
