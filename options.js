import { historyToCsv, historyToText, uniqueHostnames } from "./lib.js";

const $ = (selector) => document.querySelector(selector);
const elements = {
  enabled: $("#enabled"), total: $("#total"), unique: $("#unique"), protectedCount: $("#protectedCount"),
  rows: $("#rows"), search: $("#search"), kind: $("#kind"), empty: $("#empty"),
  blocklist: $("#blocklistInput"), sites: $("#sitesInput"), popupBlocking: $("#popupBlocking"),
  maxHistory: $("#maxHistory"), saved: $("#saved")
};

let settings;
let history = [];

init().catch((error) => setStatus(error.message, true));

async function init() {
  const state = await send({ type: "getState" });
  settings = state.settings;
  history = state.history;
  populate();

  elements.search.addEventListener("input", renderHistory);
  elements.kind.addEventListener("change", renderHistory);
  elements.enabled.addEventListener("change", () => savePatch({ enabled: elements.enabled.checked }));
  $("#saveBlocklist").addEventListener("click", saveBlocklist);
  $("#saveSites").addEventListener("click", saveSites);
  $("#saveSettings").addEventListener("click", savePreferences);
  $("#clear").addEventListener("click", clearHistory);
  $("#blockShown").addEventListener("click", blockShown);
  $("#exportJson").addEventListener("click", () => download("redirect-history.json", JSON.stringify(filteredHistory(), null, 2), "application/json"));
  $("#exportCsv").addEventListener("click", () => download("redirect-history.csv", historyToCsv(filteredHistory()), "text/csv"));
  $("#exportTxt").addEventListener("click", () => download("redirect-urls.txt", historyToText(filteredHistory()), "text/plain"));
  elements.rows.addEventListener("click", handleRowAction);
}

function populate() {
  elements.enabled.checked = settings.enabled;
  elements.blocklist.value = settings.blocklist.join("\n");
  elements.sites.value = settings.protectedSites.join("\n");
  elements.popupBlocking.checked = settings.blockCrossOriginPopups;
  elements.maxHistory.value = settings.maxHistory;
  const kinds = [...new Set(history.map((entry) => entry.kind).filter(Boolean))].sort();
  elements.kind.replaceChildren(new Option("All types", ""), ...kinds.map((kind) => new Option(kind, kind)));
  renderStats();
  renderHistory();
}

function renderStats() {
  elements.total.textContent = history.length.toLocaleString();
  elements.unique.textContent = new Set(history.map((entry) => entry.targetHost).filter(Boolean)).size.toLocaleString();
  elements.protectedCount.textContent = settings.protectedSites.length.toLocaleString();
}

function filteredHistory() {
  const query = elements.search.value.trim().toLowerCase();
  const kind = elements.kind.value;
  return history.filter((entry) => {
    const text = [entry.sourceUrl, entry.targetUrl, entry.reason, entry.kind].join(" ").toLowerCase();
    return (!query || text.includes(query)) && (!kind || entry.kind === kind);
  });
}

function renderHistory() {
  const rows = filteredHistory();
  elements.rows.replaceChildren(...rows.map(makeRow));
  elements.empty.hidden = rows.length > 0;
}

function makeRow(entry) {
  const tr = document.createElement("tr");
  tr.append(
    cell(formatDate(entry.timestamp), entry.reason),
    cell(entry.sourceHost || "Unknown", entry.sourceUrl),
    cell(entry.targetHost || "Unknown", entry.targetUrl),
    pillCell(entry.kind),
    actionCell(entry.targetHost)
  );
  return tr;
}

function cell(primary, secondary) {
  const td = document.createElement("td");
  const strong = document.createElement("strong");
  strong.textContent = primary;
  strong.title = primary;
  const span = document.createElement("span");
  span.textContent = secondary || "";
  span.title = secondary || "";
  td.append(strong, span);
  return td;
}

function pillCell(value) {
  const td = document.createElement("td");
  const span = document.createElement("span");
  span.className = "pill";
  span.textContent = value || "other";
  td.append(span);
  return td;
}

function actionCell(host) {
  const td = document.createElement("td");
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.blockHost = host || "";
  button.textContent = settings.blocklist.includes(host) ? "Blocked" : "Block domain";
  button.disabled = !host || settings.blocklist.includes(host);
  td.append(button);
  return td;
}

async function handleRowAction(event) {
  const host = event.target.dataset.blockHost;
  if (!host) return;
  const result = await send({ type: "addToBlocklist", hosts: [host] });
  settings = result.settings;
  elements.blocklist.value = settings.blocklist.join("\n");
  renderHistory();
  setStatus(`${host} added to the blocklist.`);
}

async function blockShown() {
  const hosts = filteredHistory().map((entry) => entry.targetHost).filter(Boolean);
  if (!hosts.length) return setStatus("No destinations are shown.", true);
  const result = await send({ type: "addToBlocklist", hosts });
  settings = result.settings;
  elements.blocklist.value = settings.blocklist.join("\n");
  renderHistory();
  setStatus(`${uniqueHostnames(hosts).length} domain(s) added to the blocklist.`);
}

async function saveBlocklist() {
  await savePatch({ blocklist: lines(elements.blocklist.value) });
  elements.blocklist.value = settings.blocklist.join("\n");
  renderHistory();
}

async function saveSites() {
  await savePatch({ protectedSites: lines(elements.sites.value) });
  elements.sites.value = settings.protectedSites.join("\n");
}

async function savePreferences() {
  await savePatch({
    blockCrossOriginPopups: elements.popupBlocking.checked,
    maxHistory: Number(elements.maxHistory.value)
  });
}

async function savePatch(patch) {
  const result = await send({ type: "updateSettings", patch });
  settings = result.settings;
  elements.enabled.checked = settings.enabled;
  renderStats();
  setStatus("Saved.");
}

async function clearHistory() {
  if (!confirm("Clear all locally stored redirect history? This cannot be undone.")) return;
  await send({ type: "clearHistory" });
  history = [];
  renderStats();
  renderHistory();
  setStatus("History cleared.");
}

function lines(value) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function download(filename, body, type) {
  const blobUrl = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function setStatus(message, isError = false) {
  elements.saved.textContent = message;
  elements.saved.style.color = isError ? "#ff91a6" : "#57dabd";
  clearTimeout(setStatus.timer);
  setStatus.timer = setTimeout(() => { elements.saved.textContent = ""; }, 3500);
}

function send(message) {
  return chrome.runtime.sendMessage(message).then((response) => {
    if (!response?.ok) throw new Error(response?.error || "Extension request failed.");
    return response;
  });
}
