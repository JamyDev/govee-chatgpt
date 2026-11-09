# Verification record

Local validation completed on 2026-11-09 using Node.js 24.22.1.

- Strict TypeScript source check: passed.
- Automated tests: **27 passed, 0 failed**.
- Production TypeScript build: passed.
- Production dependency audit (`npm audit --omit=dev`): no known vulnerabilities reported at validation time.
- Built stdio MCP smoke test: initialized using the official MCP client, discovered eight tools and listed one simulated light.
- Streamable HTTP MCP integration test: initialized, listed tools, changed simulated RGB state and read it back.
- Security-focused tests: OAuth issuer/audience/expiry/subject, all write-scope gates, unauthenticated HTTP, metadata, host/origin validation, payload limits, redacted errors, cancelled/expired dispatch, upstream response limits.

The project includes a GitHub Actions matrix for Node.js 22 and 24, but remote CI has **not** run. Node.js 22 has not been exercised locally. No Govee account, credential, physical light, external OAuth provider or Secure MCP Tunnel was used. A local Codex marketplace install and bundled runtime were tested in an isolated temporary home, but the Windows ChatGPT UI has not been validated. None of these results demonstrate hardware compatibility, live cloud API behavior or directory eligibility.
