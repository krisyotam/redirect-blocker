import { hostnameFrom, hostMatches } from "./lib.js";

const elements = {
  enabled: document.querySelector("#enabled"),
  status: document.querySelector("#status"),
  site: document.querySelector("#site"),
  protect: document.querySelector("#protect"),
  history: document.querySelector("#history"),
  count: document.querySelector("#count"),
  dashboard: document.querySelector("#dashboard")
};

let activeUrl = "";
let settings;

init().catch(showError);

async function init() {
  const [[tab], state] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    send({ type: "getPopupState" })
  ]);
  settings = state.settings;
  activeUrl = tab?.url || "";
  render(state.history);

  elements.enabled.addEventListener("change", async () => {
    const result = await send({ type: "updateSettings", patch: { enabled: elements.enabled.checked } });
    settings = result.settings;
    renderStatus();
  });

  elements.protect.addEventListener("click", async () => {
    const protectedNow = isCurrentSiteProtected();
    const result = await send({ type: "setSiteProtected", url: activeUrl, protected: !protectedNow });
    settings = result.settings;
    renderSite();
  });

  elements.dashboard.addEventListener("click", () => chrome.runtime.openOptionsPage());
}

function render(history) {
  elements.enabled.checked = settings.enabled;
  renderStatus();
  renderSite();
  elements.count.textContent = `${history.length}${history.length === 5 ? "+" : ""} recent`;
  elements.history.replaceChildren();
  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No blocked redirects yet.";
    elements.history.append(empty);
    return;
  }
  for (const entry of history) {
    const row = document.createElement("div");
    row.className = "entry";
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = "↗";
    const details = document.createElement("div");
    const host = document.createElement("strong");
    host.textContent = entry.targetHost || entry.targetUrl;
    const meta = document.createElement("span");
    meta.textContent = `${entry.kind} · ${relativeTime(entry.timestamp)}`;
    details.append(host, meta);
    row.append(icon, details);
    elements.history.append(row);
  }
}

function renderStatus() {
  elements.status.textContent = settings.enabled ? "Protection is on" : "Protection is paused";
}

function renderSite() {
  const host = hostnameFrom(activeUrl);
  elements.site.textContent = host || "This browser page";
  elements.protect.disabled = !host;
  const protectedNow = isCurrentSiteProtected();
  elements.protect.textContent = protectedNow ? "Protected" : "Protect site";
  elements.protect.classList.toggle("active", protectedNow);
}

function isCurrentSiteProtected() {
  return hostMatches(hostnameFrom(activeUrl), settings.protectedSites);
}

function relativeTime(value) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function send(message) {
  return chrome.runtime.sendMessage(message).then((response) => {
    if (!response?.ok) throw new Error(response?.error || "Extension request failed.");
    return response;
  });
}

function showError(error) {
  elements.status.textContent = error.message;
}
