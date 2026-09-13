export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  blockCrossOriginPopups: true,
  protectedSites: [],
  allowlist: [],
  blocklist: [],
  maxHistory: 1000
});

export function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function hostnameFrom(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function normalizeHostname(value) {
  const candidate = String(value || "").trim().toLowerCase();
  if (!candidate) return "";
  const fromUrl = hostnameFrom(candidate.includes("://") ? candidate : `https://${candidate}`);
  return fromUrl.replace(/^\.+|\.+$/g, "");
}

export function uniqueHostnames(values) {
  return [...new Set((values || []).map(normalizeHostname).filter(Boolean))].sort();
}

export function hostMatches(hostname, patterns) {
  const host = normalizeHostname(hostname);
  return uniqueHostnames(patterns).some((pattern) => host === pattern || host.endsWith(`.${pattern}`));
}

export function isCrossOrigin(sourceUrl, targetUrl) {
  try {
    return new URL(sourceUrl).origin !== new URL(targetUrl, sourceUrl).origin;
  } catch {
    return false;
  }
}

export function isProtected(sourceUrl, settings) {
  if (!settings?.enabled) return false;
  return hostMatches(hostnameFrom(sourceUrl), settings.protectedSites);
}

export function shouldBlockTarget(sourceUrl, targetUrl, settings, { popup = false } = {}) {
  if (!settings?.enabled) return false;
  let resolvedTarget;
  try {
    resolvedTarget = new URL(targetUrl, sourceUrl).href;
  } catch {
    return false;
  }
  if (!isHttpUrl(resolvedTarget)) return false;
  const targetHost = hostnameFrom(resolvedTarget);
  if (hostMatches(targetHost, settings.allowlist)) return false;
  if (hostMatches(targetHost, settings.blocklist)) return true;
  return Boolean(popup && settings.blockCrossOriginPopups && isProtected(sourceUrl, settings) && isCrossOrigin(sourceUrl, resolvedTarget));
}

export function dynamicRulesFor(blocklist) {
  return uniqueHostnames(blocklist).slice(0, 5000).map((host, index) => ({
    id: index + 1,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${host}^`,
      resourceTypes: ["main_frame", "sub_frame"]
    }
  }));
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function historyToCsv(history) {
  const columns = ["timestamp", "sourceUrl", "targetUrl", "targetHost", "kind", "reason"];
  return [columns.join(","), ...(history || []).map((row) => columns.map((key) => csvEscape(row[key])).join(","))].join("\n");
}

export function historyToText(history) {
  return [...new Set((history || []).map((entry) => entry.targetUrl).filter(Boolean))].join("\n");
}
