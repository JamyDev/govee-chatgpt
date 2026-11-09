import { AppError } from './domain.js';
export type AuthConfig = { issuer: string; jwksUrl: string; resource: string; subjects: string[] };
export type Config = { mode: 'demo' | 'live'; transport: 'http' | 'stdio'; host: string; port: number; apiKey?: string; allowedDevices: string[]; auth?: AuthConfig };
const split = (input?: string) => (input ?? '').split(',').map(s => s.trim()).filter(Boolean);
function httpsUrl(value: string | undefined, name: string): string {
  try {
    const url = new URL(value ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    return url.toString();
  } catch { throw new AppError('configuration_error', `${name} must be an HTTPS URL without credentials, query or fragment.`); }
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.GOVEE_MODE ?? 'demo';
  const transport = env.MCP_TRANSPORT ?? 'http';
  const host = env.HOST ?? '127.0.0.1';
  const port = Number(env.PORT ?? '3000');
  if (!['demo', 'live'].includes(mode) || !['http', 'stdio'].includes(transport) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new AppError('configuration_error', 'Invalid mode, transport or port.');
  if (!['127.0.0.1', '::1', '0.0.0.0'].includes(host)) throw new AppError('configuration_error', 'HOST must be 127.0.0.1, ::1 or 0.0.0.0.');
  const config: Config = { mode: mode as Config['mode'], transport: transport as Config['transport'], host, port, apiKey: env.GOVEE_API_KEY, allowedDevices: split(env.GOVEE_ALLOWED_DEVICES) };
  if (mode === 'live' && !env.GOVEE_API_KEY) throw new AppError('configuration_error', 'Live mode requires GOVEE_API_KEY set privately on the server.');
  if (env.OAUTH_ISSUER || env.OAUTH_JWKS_URL || env.MCP_RESOURCE_URL || env.OAUTH_ALLOWED_SUBJECTS) {
    const subjects = split(env.OAUTH_ALLOWED_SUBJECTS);
    if (!subjects.length) throw new AppError('configuration_error', 'OAUTH_ALLOWED_SUBJECTS must restrict access to this household’s explicitly authorized identities.');
    const resource = httpsUrl(env.MCP_RESOURCE_URL, 'MCP_RESOURCE_URL');
    if (new URL(resource).pathname !== '/mcp') throw new AppError('configuration_error', 'MCP_RESOURCE_URL must end in /mcp, without a trailing slash.');
    config.auth = { issuer: httpsUrl(env.OAUTH_ISSUER, 'OAUTH_ISSUER'), jwksUrl: httpsUrl(env.OAUTH_JWKS_URL, 'OAUTH_JWKS_URL'), resource, subjects };
    // Issuer comparison is exact. Preserve a configured URL’s trailing slash choice.
    config.auth.issuer = env.OAUTH_ISSUER!;
  }
  if (transport === 'http' && mode === 'live' && !config.auth)
    throw new AppError('configuration_error', 'Live HTTP requires OAuth configuration. Use stdio for private local operation.');
  if (transport === 'http' && host === '0.0.0.0' && !config.auth)
    throw new AppError('configuration_error', 'Unauthenticated HTTP is restricted to loopback, even in demo mode.');
  return config;
}
