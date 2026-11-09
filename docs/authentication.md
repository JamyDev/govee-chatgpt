# Authentication and deployment

## Two distinct credentials

1. **ChatGPT → this MCP resource server:** an OAuth access token issued by your authorization server, valid only for this MCP resource and the authorized household identity.
2. **This server → Govee:** the household’s Govee API key, supplied privately by the operator. It is never returned to ChatGPT.

They are not interchangeable. A public app ID, public verification key or “app token” is not proof of a user’s authorization and must not unlock a household credential.

## Included resource-server checks

Set these values before starting HTTP live mode:

- `GOVEE_MODE=live`
- `GOVEE_API_KEY` privately on the server
- `OAUTH_ISSUER`: exact HTTPS issuer identifier, including any trailing slash
- `OAUTH_JWKS_URL`: trusted HTTPS signing-key endpoint
- `MCP_RESOURCE_URL`: canonical HTTPS URL ending exactly in `/mcp`
- `OAUTH_ALLOWED_SUBJECTS`: comma-separated exact subjects authorized for this household
- Optionally `GOVEE_ALLOWED_DEVICES`: comma-separated upstream device IDs

The resource metadata is served at `/.well-known/oauth-protected-resource/mcp` and the root well-known alias. Unauthenticated MCP requests return 401 with a `WWW-Authenticate` discovery challenge. A token needs `govee:read` for MCP access; every control tool also needs `govee:control`. Signing algorithms are restricted to RS256/ES256. Opaque tokens/introspection are not implemented.

`HOST=127.0.0.1` is the default. If a trusted HTTPS reverse proxy/container network needs `HOST=0.0.0.0`, configure OAuth first and firewall the backend port. The Node listener itself does not implement TLS. Preserve the canonical Host header or use a loopback upstream; unrecognized hosts and cross-origin browser requests are rejected. CORS is intentionally not enabled.

## Required authorization-server configuration (not included)

Follow the [current OpenAI authentication guide](https://developers.openai.com/plugins/build/auth) and the [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization). Your provider must support:

- Authorization-code flow with PKCE S256 and appropriate authorization-server metadata.
- A supported client identification/registration mode (preconfigured client, CIMD or DCR).
- The **exact** redirect URI shown by ChatGPT for this connection. Do not copy a guessed or broad wildcard callback.
- The MCP `resource` value bound to the access-token audience.
- Short-lived tokens containing `iss`, `aud`, `sub`, `iat`, `exp` and a space-separated `scope` claim.
- Consent and policy limiting `govee:control` to explicitly authorized users.

The project does not provision an identity provider, client registration, refresh-token storage, tenant linking or secrets. End-to-end ChatGPT login has not been tested. Verify login, consent, denied scopes, expiry, unlinking, and subject isolation before real deployment.

## Private stdio/tunnel alternative

A local stdio client can start `dist/index.js` with `MCP_TRANSPORT=stdio` and no OAuth. A Secure MCP Tunnel can expose that private process to an authorized workspace. Restrict the tunnel’s users because stdio has no independent per-user authentication. Tunnel creation and runtime-key setup are separate, security-sensitive setup steps not performed by this project.
