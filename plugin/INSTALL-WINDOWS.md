# Install Govee Lights (Local) on Windows

This ZIP is a **private desktop plugin package**, with plugin manifests, a skill and a prebuilt MCP server plus its JavaScript dependencies. It starts in **demo mode**. No compilation or npm install is required.

## Supported private install

1. The package needs Node.js **22 or newer**. The Windows helper first looks for Node on PATH, then for ChatGPT’s existing local runtime. It does not download anything.
2. Extract the ZIP to a regular folder. Do not run it from inside Explorer’s ZIP preview.
3. Double-click **install-windows.cmd**. It registers the private plugin using an existing Node runtime. Alternatively, open a terminal in the extracted folder and run:

   ```powershell
   node .\install-local.cjs
   ```

4. Restart the ChatGPT desktop app. Open **Plugins**, select your personal/local marketplace, and install **Govee Lights (Local)**.
5. Start a conversation that runs on **this computer**, enable/mention the plugin, and ask: “List my Govee lights and tell me whether demo mode is active.” It should return **Demo house lights**.

The registration helper copies the package into your user plugin folder and adds one entry to your personal local marketplace. It preserves other entries and backs up an existing marketplace file. It does not install Node, change security/approval settings, collect credentials or call Govee. The desktop app still owns the final plugin install/enable step.

If `node` is not found, install Node.js and reopen the terminal. If the app has no local marketplace or local-execution support, stop and share the **non-sensitive error text**. Do not upload a real credential file for diagnosis.

## About Upload ZIP

A supported plugin manifest is now included at the ZIP root. However, **public directory Upload ZIP is a developer submission flow**, not a universal private installer. Public local-MCP submissions require approved-partner eligibility. Workspace/private uploads may also be governed by workspace permissions. Do not submit this unofficial project publicly; use the documented private local-marketplace route above unless your account explicitly supports private ZIP upload.

If using a private ZIP importer, it must support local stdio MCP servers and have Node.js 22+ available to the local host. We have validated package structure and local runtime behavior, but not your specific Windows import screen.

## Connect real lights later

Installing the plugin does **not** authorize changing lights or storing a Govee key. Keep demo mode until you deliberately configure your own household.

After reviewing Govee’s service terms and choosing to configure a credential, create this private file yourself:

`%APPDATA%\GoveeChatGPT\config.json`

Example format (the example contains no credential):

```json
{
  "mode": "live",
  "apiKey": "REPLACE_LOCALLY_WITH_YOUR_OWN_KEY",
  "allowedDevices": []
}
```

The file is read only by the local server process. Its key is stored as plaintext in that file: restrict access to your Windows account, keep it outside shared/synced folders, and never place it in the ZIP, plugin manifests, Git or chat. A future OS-credential-store integration is not implemented. You can optionally limit `allowedDevices` to exact device IDs. Restart the app/server after changes. To return to simulation, set `mode` to `demo`.

The plugin never uploads this file or exposes its contents as a tool. Govee requests use your key only against the official Govee endpoint when you invoke live tools. Creating a new Govee key invalidates earlier keys and can break existing integrations.

## Verified and unverified

- Verified: portable schema validation, clean extraction, registration in an isolated personal marketplace, actual Codex plugin installation, launch from the installed cache, eight MCP tools and simulated controls. These checks ran in a Linux cloud environment, not the user’s Windows app.
- Verified: underlying source tests/typecheck/build.
- Not verified: installation in your Windows UI, live Govee hardware, public directory eligibility.
- Node.js is a prerequisite; it is **not bundled** in this ZIP.

Official references:
- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/deploy/desktop-only
- https://learn.chatgpt.com/docs/app/windows
