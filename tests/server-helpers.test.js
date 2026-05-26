const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";

const {
  normalizeCustomBaseUrl,
  resolveCustomProfileInput,
  analyzeConfiguration,
  inferCompatibilityProfile,
  resolveApplyTarget,
  buildProbeRequest,
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
