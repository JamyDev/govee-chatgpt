# Contributing

Use Node.js 22+ and run `npm ci`, then `npm run check` and `npm run test:plugin`. Keep dependencies locked and inspect `npm audit --omit=dev`. New controls require official API evidence, fixture tests, input bounds, discovered-capability validation and explicit write annotations.

Never commit `.env`, tokens, real device IDs, home names or personal account data. Tests must use fabricated fixtures and never contact Govee. Do not add generic capability passthrough, public unauthenticated controls, custom crypto, secret-upload forms or automatic write retries.

Hosted service distribution and public plugin-directory submission require separate API/platform terms review. Contributions are under the project’s MIT license for original code; this does not waive third-party service restrictions.
