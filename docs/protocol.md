# Protocol notes and sources

Reviewed against official documentation on 2026-11-09. These links describe the service contract; real-device verification is still outstanding.

## Govee

Base URL: `https://openapi.api.govee.com/router/api/v1`.

- [Device discovery](https://developer.govee.com/reference/get-you-devices): GET `/user/devices`; response includes device type and capability parameters.
- [State](https://developer.govee.com/reference/get-devices-status): POST `/device/state` with a UUID `requestId` and `payload` containing `sku` and `device`.
- [Control](https://developer.govee.com/reference/control-you-devices): POST `/device/control` with the same device fields and a `capability` containing `type`, `instance`, `value`.
- [Dynamic scenes](https://developer.govee.com/reference/get-light-scene): POST `/device/scenes`; scene option values may be objects such as `{paramId,id}`. The server preserves values and lets clients select only generated scene IDs.
- [Supported models](https://developer.govee.com/docs/support-product-model): model inclusion is not a guarantee that every capability is available on the user’s device.
- [API-key setup](https://developer.govee.com/reference/apply-you-govee-api-key) and [rotation policy](https://developer.govee.com/changelog/important-policy-update-important-notice-regarding-api-key-security-management).
- [API service terms](https://app-h5.govee.com/common/api-service-item): separate from the code license; distribution and third-party-use provisions require review before public release.

The control documentation does not show a complete usable success envelope. This implementation requires HTTP success and a numeric `code: 200`, and reports only API acceptance. Any incompatible actual response fails closed instead of fabricating success.

Published router rate limits currently include device discovery 30/min/account; state and scenes 30/min/device; controls 12/sec/account and 2/sec/device. This implementation is conservative: discovery is cached 60 seconds, scenes five minutes, state/scenes are paced at least 2.1 seconds per endpoint/device, and writes at least 600ms globally. It honors Retry-After advice without automatic retries. Limits can change and other applications using the key consume quota too.

## OpenAI / MCP

- [MCP server quickstart](https://developers.openai.com/plugins/build/app-quickstart): tools-only integrations do not need a UI resource.
- [Authentication](https://developers.openai.com/plugins/build/auth): OAuth, resource metadata, token validation and tool-level scopes.
- [Custom MCP server setup](https://developers.openai.com/api/docs/guides/custom-mcp-server).
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
- [Public plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines): eligibility of unofficial third-party integrations and credential collection must be reviewed separately.

No legacy ChatGPT plugin manifest or arbitrary API-key-based remote connection flow is included.
