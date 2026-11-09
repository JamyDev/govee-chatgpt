# Security model

This is an early, self-hosted, single-household project. Do not use it as a public shared service or safety-critical controller. Treat home device names, IDs and state as private user data.

## Boundaries

- Govee API keys stay in the source server’s environment/private secret manager, or in the desktop entry point’s user-managed private local configuration file. The desktop JSON file is plaintext and must not be shared or committed. They are never MCP arguments, resources, results or URLs. There is no key-submission endpoint.
- HTTP live mode requires OAuth. Tokens are verified with trusted JWKS, RS256/ES256 only, exact issuer, audience, expiry, issued-at claim and an explicit subject allowlist. Read and write scopes are enforced independently.
- The OAuth issuer, JWKS URL and canonical resource URL are operator configuration, never client inputs. Only one household’s explicitly authorized identities belong in the subject allowlist.
- stdio intentionally trusts its process owner. A private tunnel’s access controls are the boundary for a tunnel-backed stdio server. Do not share that tunnel with unauthorized users.
- HTTP rejects unexpected Host/Origin, limits incoming bodies to 32 KiB, disables caching and exposes no stack traces. Run behind TLS and a reverse proxy with connection/request limits. Do not trust arbitrary forwarded headers.
- Upstream URLs are fixed; redirects are rejected. Responses are limited to 1 MiB and a 10-second timeout. Errors omit upstream messages to reduce accidental credential leakage.
- Only discovered lights and allowlisted capability types are usable. Optional device allowlisting narrows the household further. Names and scene labels are untrusted data and must never become model instructions.
- Writes are not retried automatically. Undispatched writes expire after three seconds in the limiter queue and respect MCP/HTTP cancellation. Once a write has reached Govee, cancellation cannot undo it. Rate limiting is process-local; do not scale replicas against one key.
- Tests use only fabricated devices and ephemeral signing material. No real credential is included.

## Operations

Keep `.env`, shell history, crash dumps and infrastructure logs private. The application never logs credentials, but a reverse proxy, debugger or process monitor might. Disable request-body/Authorization-header logging. Restrict local filesystem and process access. Rotate exposed secrets using the provider’s supported flow and understand Govee key rotation can invalidate other integrations.

Do not post vulnerabilities with credentials, real device IDs, home details or exploit-ready secrets in a public issue. Use a repository private security advisory if available; otherwise contact the maintainer through an established private channel. A formal security audit has not been completed.
