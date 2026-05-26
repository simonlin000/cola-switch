const STORAGE_PREFIX = "cola_switch_key_";

const state = {
  providers: [],
  customColaProviders: [],
  compatibilityProfiles: [],
  providerId: "",
  variantId: "",
  profileId: "direct",
  model: "",
  customColaProvider: "openai",
  customBaseUrl: "",
  status: null,
  backups: [],
  pending: false,
};

const elements = {
  statusPanel: document.getElementById("status-panel"),
  rollbackButton: document.getElementById("rollback-button"),
  backupMeta: document.getElementById("backup-meta"),
  providerGrid: document.getElementById("provider-grid"),
  variantBlock: document.getElementById("variant-block"),
  variantSelect: document.getElementById("variant-select"),
  variantHelp: document.getElementById("variant-help"),
  profileSelect: document.getElementById("profile-select"),
  profileHelp: document.getElementById("profile-help"),
  modelInput: document.getElementById("model-input"),
  modelHelp: document.getElementById("model-help"),
  modelSuggestions: document.getElementById("model-suggestions"),
  apiKeyInput: document.getElementById("api-key-input"),
  providerHint: document.getElementById("provider-hint"),
  advancedPanel: document.getElementById("advanced-panel"),
  customFields: document.getElementById("custom-fields"),
  customProviderSelect: document.getElementById("custom-provider-select"),
  customBaseUrlInput: document.getElementById("custom-base-url-input"),
  switchForm: document.getElementById("switch-form"),
  applyButton: document.getElementById("apply-button"),
  applyButtons: Array.from(document.querySelectorAll("[data-apply-button='true']")),
  actionSummary: document.getElementById("action-summary"),
  resultBanner: document.getElementById("result-banner"),
  providerCardTemplate: document.getElementById("provider-card-template"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function postNativeStatus(type, message) {
  try {
    const handler = window.webkit?.messageHandlers?.colaStatus;
    if (handler && typeof handler.postMessage === "function") {
      handler.postMessage({ type, message });
    }
  } catch {}
}

window.addEventListener("error", (event) => {
  postNativeStatus("error", `JS error: ${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  postNativeStatus("error", `Promise error: ${reason}`);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  const id = target && typeof target.id === "string" ? target.id : "";
  const tag = target && typeof target.tagName === "string" ? target.tagName : "";
  const className = target && typeof target.className === "string" ? target.className : "";
  const text = target && typeof target.textContent === "string" ? target.textContent.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  postNativeStatus("debug", `document-click:${tag}${id ? `#${id}` : ""}${className ? `.${className}` : ""}${text ? `::${text}` : ""}`);
}, true);

document.addEventListener("pointerdown", (event) => {
  const target = event.target;
  const id = target && typeof target.id === "string" ? target.id : "";
  const tag = target && typeof target.tagName === "string" ? target.tagName : "";
  const className = target && typeof target.className === "string" ? target.className : "";
  const text = target && typeof target.textContent === "string" ? target.textContent.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  postNativeStatus("debug", `pointerdown:${tag}${id ? `#${id}` : ""}${className ? `.${className}` : ""}${text ? `::${text}` : ""}`);
}, true);

async function request(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error || `请求失败：${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function maskKey(value) {
  if (!value) {
    return "未保存";
  }
  if (value.length <= 10) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

function getProvider(providerId) {
  return state.providers.find((item) => item.id === providerId);
}

function getVariant(providerId, variantId) {
  return getProvider(providerId)?.variants.find((item) => item.id === variantId);
}

function getProfile(profileId) {
  return state.compatibilityProfiles.find((item) => item.id === profileId);
}

function isCustomMode() {
  return state.providerId === "custom";
}

function getStorageKeyId() {
  if (isCustomMode()) {
    return `custom:${state.customColaProvider}`;
  }
  return state.providerId;
}

function showBanner(message, tone = "success") {
  elements.resultBanner.hidden = false;
  elements.resultBanner.className = `result-banner is-${tone}`;
  elements.resultBanner.textContent = message;
  elements.resultBanner.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearBanner() {
  elements.resultBanner.hidden = true;
  elements.resultBanner.textContent = "";
  elements.resultBanner.className = "result-banner";
}

function saveKey(storageId, value) {
  if (!storageId) {
    return;
  }
  if (!value) {
    localStorage.removeItem(`${STORAGE_PREFIX}${storageId}`);
    return;
  }
  localStorage.setItem(`${STORAGE_PREFIX}${storageId}`, value);
}

function getSavedKey(storageId) {
  return localStorage.getItem(`${STORAGE_PREFIX}${storageId}`) || "";
}

function renderStatus() {
  const status = state.status;
  if (!status) {
    elements.statusPanel.className = "status-panel is-loading";
    elements.statusPanel.textContent = "还没有拿到状态。";
    return;
  }

  const provider = getProvider(status.providerId);
  const title = provider?.name || status.providerLabel || status.providerId;
  const warnings = status.diagnostics?.warnings || [];
  const notes = status.diagnostics?.notes || [];
  const warningHtml = warnings.length
    ? `
      <div class="diagnostic-group is-warning">
        <div class="diagnostic-title">风险提示</div>
        <ul class="diagnostic-list">
          ${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
    `
    : "";
  const notesHtml = notes.length
    ? `
      <div class="diagnostic-group is-note">
        <div class="diagnostic-title">切换备注</div>
        <ul class="diagnostic-list">
          ${notes.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
    `
    : "";

  elements.statusPanel.className = "status-panel";
  elements.statusPanel.innerHTML = `
    <div class="status-main">
      <div class="status-title">
        <span class="status-provider">${escapeHtml(title)}</span>
        <span class="status-model">${escapeHtml(status.model)}</span>
      </div>
      <div class="status-meta">
        入口：${escapeHtml(status.variantLabel || "未识别")}<br>
        接入模式：${escapeHtml(status.profileLabel || "原生直连")}<br>
        Cola provider：${escapeHtml(status.colaProvider)}<br>
        Base URL：${escapeHtml(status.baseUrl || "未设置")}<br>
        已保存 Key：${escapeHtml(maskKey(status.apiKey))}<br>
        配置文件：${escapeHtml(status.settingsFile)}
      </div>
    </div>
    ${warningHtml}
    ${notesHtml}
  `;
}

function renderBackupStatus() {
  const latest = state.backups[0];
  elements.rollbackButton.disabled = state.pending || !latest;
  elements.backupMeta.textContent = latest
    ? `最近备份：${latest.fileName}`
    : "还没有可回滚的备份。";
}

function renderProviderCards() {
  elements.providerGrid.innerHTML = "";

  state.providers.forEach((provider) => {
    const node = elements.providerCardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.providerId = provider.id;
    node.querySelector(".provider-name").textContent = provider.shortName;
    node.querySelector(".provider-meta").textContent = provider.tagline;

    if (provider.id === state.providerId) {
      node.classList.add("is-active");
    }

    node.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.providerId = provider.id;
      state.variantId = provider.defaultVariantId;
      state.model = provider.defaultModel || "";
      if (provider.custom && !state.customColaProvider) {
        state.customColaProvider = state.customColaProviders[0]?.id || "openai";
      }
      if (provider.custom && !state.customBaseUrl) {
        state.customBaseUrl = "";
      }
      state.profileId = provider.custom ? (state.profileId || "openai-compatible") : "direct";
      loadSavedKey();
      render();
      clearBanner();
      if (elements.advancedPanel) {
        elements.advancedPanel.open = provider.custom;
      }
    });

    elements.providerGrid.appendChild(node);
  });
}

function renderCustomProviderOptions() {
  elements.customProviderSelect.innerHTML = "";
  state.customColaProviders.forEach((provider) => {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    if (provider.id === state.customColaProvider) {
      option.selected = true;
    }
    elements.customProviderSelect.appendChild(option);
  });
}

function renderProfileOptions() {
  elements.profileSelect.innerHTML = "";
  state.compatibilityProfiles.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.label;
    if (profile.id === state.profileId) {
      option.selected = true;
    }
    elements.profileSelect.appendChild(option);
  });
}

function renderVariantOptions() {
  const provider = getProvider(state.providerId);
  if (!provider) {
    return;
  }

  if (provider.custom) {
    elements.variantBlock.classList.add("is-hidden");
    elements.customFields.hidden = false;
    if (elements.advancedPanel) {
      elements.advancedPanel.open = true;
    }
    renderProfileOptions();
    renderCustomProviderOptions();
    elements.profileSelect.value = state.profileId;
    const profile = getProfile(state.profileId);
    if (profile?.lockedColaProvider) {
      state.customColaProvider = profile.lockedColaProvider;
    }
    if (profile?.lockedBaseUrl) {
      state.customBaseUrl = profile.lockedBaseUrl;
    }
    elements.customProviderSelect.value = state.customColaProvider;
    elements.customBaseUrlInput.value = state.customBaseUrl;
    elements.profileHelp.textContent = profile?.description || "";
    elements.customProviderSelect.disabled = Boolean(profile?.lockedColaProvider);
    elements.customBaseUrlInput.disabled = Boolean(profile?.lockedBaseUrl);
    elements.variantHelp.textContent = "";
    return;
  }

  elements.variantBlock.classList.remove("is-hidden");
  elements.customFields.hidden = true;
  elements.customProviderSelect.disabled = false;
  elements.customBaseUrlInput.disabled = false;
  elements.variantSelect.innerHTML = "";

  provider.variants.forEach((variant) => {
    const option = document.createElement("option");
    option.value = variant.id;
    option.textContent = variant.name;
    if (variant.id === state.variantId) {
      option.selected = true;
    }
    elements.variantSelect.appendChild(option);
  });

  const currentVariant = getVariant(state.providerId, state.variantId) || provider.variants[0];
  elements.variantHelp.textContent = currentVariant.help;
}

function renderModelField() {
  const provider = getProvider(state.providerId);
  const suggestions = isCustomMode() ? [] : getVariant(state.providerId, state.variantId)?.models || [];
  elements.modelSuggestions.innerHTML = "";

  suggestions.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    elements.modelSuggestions.appendChild(option);
  });

  elements.modelInput.value = state.model || "";
  elements.modelHelp.textContent = provider?.custom
    ? "自定义模式下模型完全手填。"
    : suggestions.length > 0
      ? `可以直接手填，下面这些只是建议值：${suggestions.join(" / ")}`
      : "直接手填模型名。";
}

function loadSavedKey() {
  elements.apiKeyInput.value = getSavedKey(getStorageKeyId());
}

function renderProviderHint() {
  const provider = getProvider(state.providerId);
  if (!provider) {
    return;
  }

  if (provider.custom) {
    const profile = getProfile(state.profileId);
    elements.providerHint.textContent = `${provider.keyHint} 当前会按 ${profile?.label || "自定义模式"} 写入。`;
    return;
  }

  const variant = getVariant(state.providerId, state.variantId);
  elements.providerHint.textContent = `${provider.keyHint} 当前入口会写成 ${variant.baseUrl}`;
}

function renderActionSummary() {
  const provider = getProvider(state.providerId);
  if (!provider) {
    elements.actionSummary.textContent = "目标：未选择";
    return;
  }

  if (provider.custom) {
    const profile = getProfile(state.profileId);
    const baseUrl = state.customBaseUrl || "未填写 Base URL";
    const model = state.model || "未填写模型";
    const summary = `目标：${profile?.label || "自定义"} / ${state.customColaProvider} / ${model} / ${baseUrl}`;
    elements.actionSummary.textContent = summary;
    return;
  }

  const variant = getVariant(state.providerId, state.variantId);
  const model = state.model || "未填写模型";
  const summary = `目标：${provider.name} / ${variant?.name || "默认"} / ${model}`;
  elements.actionSummary.textContent = summary;
}

function syncCurrentSelectionWithStatus() {
  if (!state.status) {
    return;
  }

  const match = state.providers.find((provider) =>
    !provider.custom && provider.variants.some((variant) => variant.colaProvider === state.status.colaProvider),
  );

  if (!match) {
    state.providerId = "custom";
    state.variantId = "manual";
    state.profileId = state.status.profileId || "openai-compatible";
    state.model = state.status.model || "";
    state.customColaProvider = state.status.colaProvider || "openai";
    state.customBaseUrl = state.status.baseUrl || "";
    return;
  }

  state.providerId = match.id;
  state.profileId = state.status.profileId || "direct";
  const variant = match.variants.find((item) => item.colaProvider === state.status.colaProvider) || match.variants[0];
  state.variantId = variant.id;
  state.model = state.status.model || match.defaultModel;
}

function render() {
  renderStatus();
  renderBackupStatus();
  renderProviderCards();
  renderVariantOptions();
  renderModelField();
  renderProviderHint();
  renderActionSummary();
  elements.applyButtons.forEach((button) => {
    button.disabled = state.pending;
    button.textContent = state.pending ? "正在写入 Cola 配置..." : "保存并切换 Cola";
  });
}

async function loadInitialData() {
  const [providersPayload, statusPayload, backupsPayload] = await Promise.all([
    request("/api/providers"),
    request("/api/status"),
    request("/api/backups"),
  ]);

  state.providers = providersPayload.providers;
  state.customColaProviders = providersPayload.customColaProviders || [];
  state.compatibilityProfiles = providersPayload.compatibilityProfiles || [];
  state.status = statusPayload.status;
  state.backups = backupsPayload.backups || [];
  syncCurrentSelectionWithStatus();
  loadSavedKey();
  render();
}

elements.variantSelect.addEventListener("change", () => {
  state.variantId = elements.variantSelect.value;
  const variant = getVariant(state.providerId, state.variantId);
  if (variant && !state.model) {
    state.model = variant.models[0] || "";
  }
  render();
  clearBanner();
});

elements.modelInput.addEventListener("input", () => {
  state.model = elements.modelInput.value.trim();
  clearBanner();
});

elements.customProviderSelect.addEventListener("change", () => {
  state.customColaProvider = elements.customProviderSelect.value;
  loadSavedKey();
  render();
  clearBanner();
});

elements.profileSelect.addEventListener("change", () => {
  state.profileId = elements.profileSelect.value;
  const profile = getProfile(state.profileId);
  if (profile?.defaultCustomColaProvider) {
    state.customColaProvider = profile.defaultCustomColaProvider;
  }
  if (profile?.defaultModel && !state.model) {
    state.model = profile.defaultModel;
  }
  if (profile?.lockedBaseUrl) {
    state.customBaseUrl = profile.lockedBaseUrl;
  }
  loadSavedKey();
  render();
  clearBanner();
});

elements.customBaseUrlInput.addEventListener("input", () => {
  state.customBaseUrl = elements.customBaseUrlInput.value.trim();
  clearBanner();
});

elements.applyButtons.forEach((button, index) => {
  button.addEventListener("click", () => {
    postNativeStatus("debug", `apply-button click::保存并切换 Cola::slot-${index}`);
  });

  button.addEventListener("mousedown", () => {
    postNativeStatus("debug", `apply-button mousedown::保存并切换 Cola::slot-${index}`);
  });
});

elements.switchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearBanner();
  state.pending = true;
  render();

  try {
    const apiKey = elements.apiKeyInput.value.trim();
    postNativeStatus("progress", "正在切换 Cola 配置…");
    const payload = {
      providerId: state.providerId,
      variantId: state.variantId,
      profileId: state.profileId,
      model: state.model.trim(),
      apiKey,
      customColaProvider: state.customColaProvider,
      customBaseUrl: state.customBaseUrl.trim(),
    };

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

    const response = await request("/api/apply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (apiKey) {
      saveKey(getStorageKeyId(), apiKey);
    }

    state.status = response.status;
    if (response.backup) {
      state.backups = [response.backup, ...state.backups.filter((item) => item.fileName !== response.backup.fileName)].slice(0, 12);
    }
    render();
    const warningSuffix = response.status.diagnostics?.warnings?.length
      ? ` 但我检测到 ${response.status.diagnostics.warnings.length} 条风险提示，建议先看一眼。`
      : "";
    const message = response.changed
      ? `已切换到 ${response.status.providerLabel} / ${response.status.model}。下一条新消息通常就会走新配置。`
      : `当前已经是 ${response.status.providerLabel} / ${response.status.model}，我刚刚替你重新保存并验证了一次。`;
    const finalMessage = `${message}${warningSuffix}`;
    showBanner(finalMessage, response.status.diagnostics?.warnings?.length ? "warn" : "success");
    postNativeStatus("success", finalMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showBanner(message, "error");
    window.alert(`切换失败：${message}`);
    postNativeStatus("error", `切换失败：${message}`);
  } finally {
    state.pending = false;
    render();
  }
});

elements.rollbackButton.addEventListener("click", async () => {
  const latest = state.backups[0];
  if (!latest) {
    showBanner("还没有可回滚的备份。", "warn");
    return;
  }

  clearBanner();
  state.pending = true;
  render();

  try {
    const response = await request("/api/rollback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fileName: latest.fileName }),
    });

    state.status = response.status;
    state.backups = await request("/api/backups").then((payload) => payload.backups || []);
    syncCurrentSelectionWithStatus();
    loadSavedKey();
    render();
    const message = `已回滚到备份 ${response.backup.fileName}。`;
    showBanner(message, "success");
    window.alert(message);
    postNativeStatus("success", message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showBanner(`回滚失败：${message}`, "error");
    window.alert(`回滚失败：${message}`);
    postNativeStatus("error", `回滚失败：${message}`);
  } finally {
    state.pending = false;
    render();
  }
});

loadInitialData().catch((error) => {
  showBanner(error.message, "error");
  elements.statusPanel.className = "status-panel";
  elements.statusPanel.textContent = "读取 Cola 本地配置失败。";
});

postNativeStatus("bridge-ready", "page-script-loaded");
