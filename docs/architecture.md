# Architecture and next steps

## Current MVP

`MCP client → transport/auth → LightService → GoveeBackend → official Govee router API`

The demo substitutes `DemoBackend` and never calls Govee. `LightService` keeps discovery/scenes in memory, filters non-light devices, generates opaque client IDs and validates commands against discovery. It never trusts a model-supplied upstream ID, scene object, URL or capability name. `GoveeBackend` uses a fixed official endpoint, bounded reads and conservative pacing. The MCP layer validates inputs, marks reads/writes, and checks scopes. HTTP is stateless per request; authorization is rechecked each time.

No database, key exchange or custom encryption has been implemented. The MVP intentionally keeps credential custody with a single household operator.

## Future hosted design: proposal only

A hosted multi-user version would be a separate security and product milestone, not a configuration toggle. Review Govee’s terms and obtain any necessary permission before developing a public credential-collecting service. OpenAI’s public-plugin policies also need review: a private working MCP integration does not imply directory eligibility.

If a permitted design eventually needs server-side credential custody:

1. Separate app identity, user authentication, authorization, tenant-to-device ownership and secret encryption. A public client ID or public key does not authorize access by itself.
2. Use OAuth/OIDC authorization-code + PKCE through a vetted provider for user linking, short-lived audience-bound access tokens, and server-enforced scopes. Avoid bespoke token exchanges or using a Govee API key as login proof.
3. Use a managed KMS and standard envelope encryption through maintained libraries. A unique data-encryption key per tenant/secret can encrypt the Govee key with a standard AEAD such as AES-256-GCM. KMS wraps the data key. Store ciphertext, nonce, authenticated version/tenant context and key identifier, never a plaintext master key in the database.
4. Treat authenticated additional data, nonce uniqueness, key rotation, backups, audit trails, deletion, access revocation and service identity as first-class design requirements. Do not invent crypto primitives or assume encryption-at-rest protects a compromised running application.
5. Fetch/decrypt only for the authorized tenant and operation; keep plaintext lifetime short; apply independent tenant authorization before every read and write. Logs, metrics, crash reports and customer support must not expose secrets.
6. Minimize credential collection. Prefer an official delegated Govee authorization model if one is made available and permitted. Review whether any key onboarding is allowed by the host platform before building it.

No cryptographic design is committed, audited or deployed. Public tokens must never be mistaken for secret key material.

## Roadmap gates

1. **Hardware validation:** identify outdoor-light model, obtain explicit user-approved secret setup, discover capabilities, and run one requested low-impact command.
2. **Private ChatGPT connection:** choose local tunnel or a properly configured OAuth provider; test installation and end-to-end permissions.
3. **Release review:** resolve API terms/public-distribution constraints, dependency/security review and test against supported real models.
4. **Optional improvements:** light groups with explicit targets, richer scene support and a small UI. Scheduling remains out of scope until separately designed and authorized.
5. **Hosted service:** only after terms, platform eligibility, identity, tenant isolation, secret custody and operational ownership are settled.
