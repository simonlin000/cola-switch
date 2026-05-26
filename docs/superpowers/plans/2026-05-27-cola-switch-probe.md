# Cola Switch Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cola Switch verify that a selected provider/model/key/baseUrl can actually answer before telling the user the switch is successful.

**Architecture:** Keep the current no-dependency Node HTTP server. Add provider request construction as small pure helpers inside `server.js`, expose `/api/probe`, reuse the same target resolution logic as `/api/apply`, and call probe from the UI before writing settings. Move backup creation until after all input validation passes.

**Tech Stack:** Node.js built-ins (`http`, `fetch`, `node:test`, `assert`), vanilla HTML/CSS/JS, macOS WKWebView shell.

---

## File Structure

- Modify `server.js`: add pure target resolution helpers, add `/api/probe`, move backup creation after validation, make probe errors structured.
- Modify `script.js`: call `/api/probe` before `/api/apply`, show probe result in the existing banner, remove success `window.alert`.
- Modify `index.html`: no required structural change unless adding a small probe status line under the apply summary.
- Modify `styles.css`: optional `.result-banner.is-info` if we add an in-progress probe state.
- Create `tests/server-helpers.test.js`: test URL normalization, custom profile resolution, request payload generation, and backup timing helper behavior.
- Create `package.json`: add `test` and `check` scripts without adding external dependencies.

---

### Task 1: Add Minimal Test Harness

**Files:**
- Create: `package.json`
- Create: `tests/server-helpers.test.js`
- Modify: `server.js`

- [ ] **Step 1: Export helpers only under test**

Add this block at the bottom of `server.js`, above `const server = http.createServer(...)`:

```js
if (process.env.NODE_ENV === "test") {
  module.exports = {
    normalizeCustomBaseUrl,
    resolveCustomProfileInput,
    analyzeConfiguration,
    inferCompatibilityProfile,
  };
}
```

- [ ] **Step 2: Prevent server listen during tests**

Replace the unconditional listener at the bottom of `server.js`:

```js
const server = http.createServer((request, response) => {
  handleRequest(request, response);
});

server.listen(PORT, HOST, () => {
  fsp.writeFile(SERVER_LOG_FILE, "", "utf8").catch(() => {});
  process.stdout.write(`Cola switch running at http://${HOST}:${PORT}\n`);
});
```

with:

```js
const server = http.createServer((request, response) => {
  handleRequest(request, response);
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, HOST, () => {
    fsp.writeFile(SERVER_LOG_FILE, "", "utf8").catch(() => {});
    process.stdout.write(`Cola switch running at http://${HOST}:${PORT}\n`);
  });
}
```

- [ ] **Step 3: Add package scripts**

Create `package.json`:

```json
{
  "name": "cola-switch",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "check": "node --check server.js && node --check script.js && zsh -n build_app.sh && zsh -n release_macos.sh",
    "test": "NODE_ENV=test node --test tests/*.test.js"
  }
}
```

- [ ] **Step 4: Add helper tests**

Create `tests/server-helpers.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";

const {
  normalizeCustomBaseUrl,
  resolveCustomProfileInput,
  analyzeConfiguration,
  inferCompatibilityProfile,
} = require("../server.js");

test("normalizeCustomBaseUrl removes endpoint suffixes", () => {
  assert.equal(
    normalizeCustomBaseUrl("https://example.com/v1/chat/completions?debug=1"),
    "https://example.com/v1",
  );
  assert.equal(
    normalizeCustomBaseUrl("https://example.com/anthropic/messages"),
    "https://example.com/anthropic",
  );
});

test("mimo token plan locks provider, base url, and default model", () => {
  const result = resolveCustomProfileInput({
    profileId: "mimo-token-plan",
    customColaProvider: "anthropic",
    customBaseUrl: "https://wrong.example.com/v1",
    model: "",
  });

  assert.equal(result.colaProvider, "openai");
  assert.equal(result.baseUrl, "https://token-plan-cn.xiaomimimo.com/v1");
  assert.equal(result.model, "mimo-v2.5-pro");
});

test("diagnostics warn for anthropic provider with non-Claude model", () => {
  const result = analyzeConfiguration({
    provider: "anthropic",
    model: "gpt-5.4-mini",
    baseUrl: "https://api.anthropic.com",
    apiKey: "sk-test",
  });

  assert.equal(result.protocol, "anthropic-compatible");
  assert.ok(result.warnings.some((item) => item.includes("非 Claude")));
});

test("profile inference detects third-party openai compatible urls", () => {
  assert.equal(
    inferCompatibilityProfile({
      provider: "openai",
      baseUrl: "https://gateway.example.com/v1",
    }),
    "openai-compatible",
  );
});
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
npm run check
```

Expected: both commands pass.

---

### Task 2: Move Backup Creation After Validation

**Files:**
- Modify: `server.js`
- Test: `tests/server-helpers.test.js`

- [ ] **Step 1: Extract target resolution from `handleApply`**

Add a helper above `handleApply`:

```js
function resolveApplyTarget(body) {
  const provider = findProvider(body.providerId);
  if (!provider) {
    throw new Error("服务商不存在。");
  }

  let colaProvider = "";
  let baseUrl = "";
  let model = "";
  let normalizationNote = "";
  let profileNotes = [];
  let appliedProfileId = "direct";
  let appliedProfileLabel = findCompatibilityProfile("direct")?.label || "原生直连";

  if (provider.custom) {
    const profileInput = resolveCustomProfileInput(body);
    colaProvider = profileInput.colaProvider;
    baseUrl = profileInput.baseUrl;
    model = profileInput.model;
    profileNotes = profileInput.notes;
    appliedProfileId = profileInput.profile.id;
    appliedProfileLabel = profileInput.profile.label;

    if (profileInput.rawBaseUrl && baseUrl && trimTrailingSlash(profileInput.rawBaseUrl) !== baseUrl) {
      normalizationNote = profileInput.profile.lockedBaseUrl
        ? `已按 ${profileInput.profile.label} 覆盖 Base URL 为 ${baseUrl}`
        : `已把 Base URL 规整成 ${baseUrl}`;
    }

    if (!colaProvider || !isCustomProviderSupported(colaProvider)) {
      throw new Error("请先选择一个 Cola provider。");
    }

    if (!baseUrl) {
      throw new Error("自定义模式下 Base URL 不能为空。");
    }
  } else {
    const variant = findVariant(body.providerId, body.variantId || provider.defaultVariantId);
    if (!variant) {
      throw new Error("入口配置不存在。");
    }

    colaProvider = variant.colaProvider;
    baseUrl = variant.baseUrl;
    model = typeof body.model === "string" ? body.model.trim() : "";
  }

  if (!model) {
    throw new Error("模型不能为空。");
  }

  return {
    provider,
    colaProvider,
    baseUrl,
    model,
    normalizationNote,
    profileNotes,
    appliedProfileId,
    appliedProfileLabel,
  };
}
```

- [ ] **Step 2: Use helper in `handleApply`**

Replace the provider/variant/custom resolution block in `handleApply` with:

```js
let target;
try {
  target = resolveApplyTarget(body);
} catch (error) {
  sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
  return;
}

const settings = await readSettings();
const nextKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
const existingKey = settings.providerKeys?.[target.colaProvider]?.apiKey || "";
const apiKey = nextKey || existingKey;

if (!apiKey) {
  sendJson(response, 400, { error: "这个服务商还没有保存过 key，请先填入 API Key。" });
  return;
}

const backup = await createSettingsBackup("before-switch");
```

Then replace later references:

```js
settings.provider = target.colaProvider;
settings.model = target.model;
settings.modelConfig = {
  sota: target.model,
  default: target.model,
  fast: target.model,
};
settings.providerKeys[target.colaProvider] = {
  apiKey,
  baseUrl: target.baseUrl,
};
```

- [ ] **Step 3: Export the helper for tests**

Add `resolveApplyTarget` to the `module.exports` block from Task 1.

- [ ] **Step 4: Add tests**

Append to `tests/server-helpers.test.js`:

```js
test("resolveApplyTarget rejects custom target with empty base url", () => {
  assert.throws(
    () => resolveApplyTarget({
      providerId: "custom",
      profileId: "openai-compatible",
      customColaProvider: "openai",
      customBaseUrl: "",
      model: "gpt-test",
    }),
    /Base URL 不能为空/,
  );
});
```

Also update the import list:

```js
const {
  normalizeCustomBaseUrl,
  resolveCustomProfileInput,
  analyzeConfiguration,
  inferCompatibilityProfile,
  resolveApplyTarget,
} = require("../server.js");
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
npm run check
```

Expected: both commands pass. Failed validation must not create a backup because `createSettingsBackup` is only after target and key validation.

---

### Task 3: Add Real API Probe Endpoint

**Files:**
- Modify: `server.js`
- Test: `tests/server-helpers.test.js`

- [ ] **Step 1: Add provider request builder**

Add above `handleApply`:

```js
function buildProbeRequest({ colaProvider, baseUrl, model, apiKey }) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl || "");
  const protocol = inferProtocol(colaProvider, normalizedBaseUrl);

  if (protocol === "anthropic-compatible") {
    return {
      protocol,
      url: `${normalizedBaseUrl}/messages`,
      options: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        }),
      },
    };
  }

  return {
    protocol,
    url: `${normalizedBaseUrl}/chat/completions`,
    options: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      }),
    },
  };
}
```

- [ ] **Step 2: Add timeout helper**

Add above `handleApply`:

```js
function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}
```

- [ ] **Step 3: Add `probeProvider`**

Add above `handleApply`:

```js
async function probeProvider(target, apiKey) {
  const request = buildProbeRequest({
    colaProvider: target.colaProvider,
    baseUrl: target.baseUrl,
    model: target.model,
    apiKey,
  });
  const timeout = createTimeoutSignal(12000);

  try {
    const response = await fetch(request.url, {
      ...request.options,
      signal: timeout.signal,
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {}

    if (!response.ok) {
      const upstreamMessage =
        payload?.error?.message ||
        payload?.message ||
        text.slice(0, 240) ||
        `HTTP ${response.status}`;
      throw new Error(`连通性检测失败：${response.status} ${upstreamMessage}`);
    }

    return {
      ok: true,
      protocol: request.protocol,
      statusCode: response.status,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("连通性检测超时：12 秒内没有收到模型服务响应。");
    }
    throw error;
  } finally {
    timeout.cancel();
  }
}
```

- [ ] **Step 4: Add `/api/probe` handler**

Add handler function:

```js
async function handleProbe(request, response) {
  const body = await readJsonBody(request);
  let target;
  try {
    target = resolveApplyTarget(body);
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    return;
  }

  const settings = await readSettings();
  const nextKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const existingKey = settings.providerKeys?.[target.colaProvider]?.apiKey || "";
  const apiKey = nextKey || existingKey;

  if (!apiKey) {
    sendJson(response, 400, { error: "这个服务商还没有保存过 key，请先填入 API Key。" });
    return;
  }

  const probe = await probeProvider(target, apiKey);
  sendJson(response, 200, {
    ok: true,
    probe,
    target: {
      colaProvider: target.colaProvider,
      model: target.model,
      baseUrl: target.baseUrl,
    },
  });
}
```

Wire it inside `handleRequest` before `/api/apply`:

```js
if (request.method === "POST" && url.pathname === "/api/probe") {
  await handleProbe(request, response);
  return;
}
```

- [ ] **Step 5: Export and test request builder**

Add `buildProbeRequest` to `module.exports`, then append tests:

```js
test("buildProbeRequest creates openai-compatible chat request", () => {
  const request = buildProbeRequest({
    colaProvider: "openai",
    baseUrl: "https://example.com/v1",
    model: "gpt-test",
    apiKey: "sk-test",
  });

  assert.equal(request.protocol, "openai-compatible");
  assert.equal(request.url, "https://example.com/v1/chat/completions");
  assert.equal(request.options.headers.authorization, "Bearer sk-test");
  assert.match(request.options.body, /gpt-test/);
});

test("buildProbeRequest creates anthropic-compatible messages request", () => {
  const request = buildProbeRequest({
    colaProvider: "anthropic",
    baseUrl: "https://example.com",
    model: "claude-test",
    apiKey: "sk-ant-test",
  });

  assert.equal(request.protocol, "anthropic-compatible");
  assert.equal(request.url, "https://example.com/messages");
  assert.equal(request.options.headers["x-api-key"], "sk-ant-test");
  assert.equal(request.options.headers["anthropic-version"], "2023-06-01");
});
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test
npm run check
```

Expected: both commands pass.

---

### Task 4: Call Probe From UI Before Apply

**Files:**
- Modify: `script.js`
- Modify: `styles.css`

- [ ] **Step 1: Add info banner tone**

Append to `styles.css` near the existing result banner tones:

```css
.result-banner.is-info {
  border-color: rgba(31, 111, 88, 0.16);
  background: rgba(31, 111, 88, 0.09);
  color: #184f40;
}
```

- [ ] **Step 2: Probe before apply**

Inside the submit handler in `script.js`, after building `payload` and before `request("/api/apply", ...)`, insert:

```js
showBanner("正在检测模型服务连通性...", "info");

const probeResponse = await request("/api/probe", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

postNativeStatus(
  "progress",
  `连通性检测通过：${probeResponse.probe.protocol} / HTTP ${probeResponse.probe.statusCode}`,
);
showBanner("连通性检测通过，正在写入 Cola 配置...", "info");
```

- [ ] **Step 3: Remove success alert**

In the successful apply block, remove:

```js
window.alert(finalMessage);
```

Keep:

```js
showBanner(finalMessage, response.status.diagnostics?.warnings?.length ? "warn" : "success");
postNativeStatus("success", finalMessage);
```

- [ ] **Step 4: Keep failure alert**

Leave failure `window.alert` calls in place for apply/probe failure:

```js
window.alert(`切换失败：${message}`);
```

This keeps failures loud while success stays in-page.

- [ ] **Step 5: Run checks**

Run:

```bash
npm run check
```

Expected: syntax checks pass.

---

### Task 5: Tighten Status Matching and Documentation

**Files:**
- Modify: `server.js`
- Modify: `README.md`

- [ ] **Step 1: Fix matched variant selection**

In `resolveUiStatus`, replace:

```js
const matchedVariant = matchedProvider?.variants.find((variant) => variant.colaProvider === activeProvider);
```

with:

```js
const matchedVariant = matchedProvider?.variants.find((variant) =>
  variant.colaProvider === activeProvider &&
  trimTrailingSlash(variant.baseUrl || "") === activeBaseUrl,
);
```

- [ ] **Step 2: Document probe behavior**

In `README.md`, under "这次更新了什么", add:

```markdown
- 切换前会做一次真实 API 连通性检测：鉴权失败、模型不存在、Base URL 不通会直接阻止写入
- 只有输入校验和连通性检测通过后才会创建备份，避免失败操作污染备份列表
```

Under "注意事项", add:

```markdown
- 连通性检测会向所选模型服务发送一条极短的 `ping` 请求，可能产生极低额度的 API 消耗
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm run check
```

Expected: both commands pass.

- [ ] **Step 4: Manual verification**

Run local server:

```bash
node server.js
```

Open:

```text
http://127.0.0.1:8765
```

Verify:

- Invalid key blocks before writing settings.
- Invalid custom Base URL blocks before backup creation.
- Valid key/model writes settings and updates current status.
- Success shows in-page banner only.
- Failure still shows alert.

---

## Self-Review

- Spec coverage: Covers real provider/model/key/baseUrl probe, safer backup timing, less noisy success UI, current status matching, and docs.
- Placeholder scan: No TBD/TODO/fill-in-later steps.
- Type consistency: `resolveApplyTarget`, `buildProbeRequest`, `probeProvider`, and `/api/probe` use the same `colaProvider/baseUrl/model/apiKey` shape.
