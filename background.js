import {
  DEFAULT_SETTINGS,
  dynamicRulesFor,
  hostnameFrom,
  hostMatches,
  isCrossOrigin,
  isHttpUrl,
  isProtected,
  shouldBlockTarget,
  uniqueHostnames
} from "./lib.js";

const STORAGE = { settings: "settings", history: "redirectHistory" };
const pendingPopupChecks = new Set();

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const settings = await getSettings();
  await saveSettings(settings);
  await syncDynamicRules(settings.blocklist);
  if (reason === "install") await chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  await syncDynamicRules(settings.blocklist);
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes[STORAGE.settings]) return;
  const settings = mergeSettings(changes[STORAGE.settings].newValue);
  await syncDynamicRules(settings.blocklist);
  await broadcastSettings(settings);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((response) => sendResponse({ ok: true, ...response }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.tabs.onCreated.addListener((tab) => {
  if (typeof tab.openerTabId !== "number") return;
  inspectPopup(tab.id, tab.openerTabId).catch(() => {});
});

chrome.webNavigation.onErrorOccurred.addListener(async (details) => {
  if (details.frameId !== 0 || details.error !== "net::ERR_BLOCKED_BY_CLIENT") return;
  const settings = await getSettings();
  if (!hostMatches(hostnameFrom(details.url), settings.blocklist)) return;
  const tab = await chrome.tabs.get(details.tabId).catch(() => null);
  await addHistory({
    sourceUrl: tab?.url || "",
    targetUrl: details.url,
    kind: "blocklist",
    reason: "Matched your domain blocklist",
    tabId: details.tabId
  });
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "getState":
      return { settings: await getSettings(), history: await getHistory() };
    case "getPopupState": {
      const [settings, history] = await Promise.all([getSettings(), getHistory()]);
      return { settings, history: history.slice(0, 5) };
    }
    case "updateSettings": {
      const current = await getSettings();
      const next = mergeSettings({ ...current, ...message.patch });
      await saveSettings(next);
      return { settings: next };
    }
    case "setSiteProtected": {
      const settings = await getSettings();
      const host = hostnameFrom(message.url);
      if (!host) throw new Error("This page cannot be protected.");
      settings.protectedSites = message.protected
        ? uniqueHostnames([...settings.protectedSites, host])
        : settings.protectedSites.filter((item) => item !== host);
      await saveSettings(settings);
      return { settings };
    }
    case "recordAttempt": {
      const settings = await getSettings();
      const sourceUrl = message.sourceUrl || sender.tab?.url || "";
      const targetUrl = resolveUrl(message.targetUrl, sourceUrl);
      if (!targetUrl || !isHttpUrl(targetUrl)) return { recorded: false };
      if (!shouldBlockTarget(sourceUrl, targetUrl, settings, { popup: message.popup })) return { recorded: false };
      const entry = await addHistory({
        sourceUrl,
        targetUrl,
        kind: message.kind || "page",
        reason: message.reason || "Blocked by page protection",
        tabId: sender.tab?.id
      });
      return { recorded: true, entry };
    }
    case "addToBlocklist": {
      const settings = await getSettings();
      settings.blocklist = uniqueHostnames([...settings.blocklist, ...(message.hosts || [])]);
      settings.allowlist = settings.allowlist.filter((host) => !settings.blocklist.includes(host));
      await saveSettings(settings);
      return { settings };
    }
    case "clearHistory":
      await chrome.storage.local.set({ [STORAGE.history]: [] });
      return {};
    default:
      throw new Error("Unknown message type.");
  }
}

async function inspectPopup(tabId, openerTabId) {
  if (pendingPopupChecks.has(tabId)) return;
  pendingPopupChecks.add(tabId);
  try {
    const opener = await chrome.tabs.get(openerTabId).catch(() => null);
    if (!opener?.url) return;
    const settings = await getSettings();
    if (!isProtected(opener.url, settings) || !settings.blockCrossOriginPopups) return;

    const popup = await waitForTabUrl(tabId);
    const targetUrl = popup?.pendingUrl || popup?.url || "";
    if (!isHttpUrl(targetUrl) || !isCrossOrigin(opener.url, targetUrl)) return;
    if (hostMatches(hostnameFrom(targetUrl), settings.allowlist)) return;

    await addHistory({
      sourceUrl: opener.url,
      targetUrl,
      kind: "popup",
      reason: hostMatches(hostnameFrom(targetUrl), settings.blocklist)
        ? "Matched your domain blocklist"
        : "Cross-origin popup from a protected site",
      tabId: openerTabId
    });
    await chrome.tabs.remove(tabId).catch(() => {});
  } finally {
    pendingPopupChecks.delete(tabId);
  }
}

async function waitForTabUrl(tabId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return null;
    if (isHttpUrl(tab.pendingUrl || tab.url || "")) return tab;
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  return chrome.tabs.get(tabId).catch(() => null);
}

function resolveUrl(target, source) {
  try {
    return new URL(target, source).href;
  } catch {
    return "";
  }
}

function mergeSettings(value = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    protectedSites: uniqueHostnames(value.protectedSites || []),
    allowlist: uniqueHostnames(value.allowlist || []),
    blocklist: uniqueHostnames(value.blocklist || []),
    maxHistory: Math.min(5000, Math.max(50, Number(value.maxHistory) || DEFAULT_SETTINGS.maxHistory))
  };
}

async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE.settings);
  return mergeSettings(result[STORAGE.settings]);
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE.settings]: mergeSettings(settings) });
}

async function getHistory() {
  const result = await chrome.storage.local.get(STORAGE.history);
  return Array.isArray(result[STORAGE.history]) ? result[STORAGE.history] : [];
}

async function addHistory({ sourceUrl, targetUrl, kind, reason, tabId }) {
  const [settings, history] = await Promise.all([getSettings(), getHistory()]);
  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sourceUrl: sourceUrl || "",
    sourceHost: hostnameFrom(sourceUrl),
    targetUrl,
    targetHost: hostnameFrom(targetUrl),
    kind,
    reason,
    tabId: Number.isInteger(tabId) ? tabId : null
  };
  history.unshift(entry);
  await chrome.storage.local.set({ [STORAGE.history]: history.slice(0, settings.maxHistory) });
  return entry;
}

async function syncDynamicRules(blocklist) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: dynamicRulesFor(blocklist)
  });
}

async function broadcastSettings(settings) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map((tab) => tab.id
    ? chrome.tabs.sendMessage(tab.id, { type: "settingsChanged", settings })
    : Promise.resolve()));
}
