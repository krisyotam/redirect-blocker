(() => {
  let settings = null;

  chrome.runtime.sendMessage({ type: "getState" }, (response) => {
    if (response?.ok) settings = response.settings;
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "settingsChanged") settings = message.settings;
  });

  document.addEventListener("redirect-blocker:window-open", (event) => {
    const targetUrl = event.detail?.targetUrl;
    if (!targetUrl || !shouldBlock(targetUrl, true)) return;
    event.preventDefault();
    record(targetUrl, "window.open", "Cross-origin window.open from a protected site", true);
  }, true);

  document.addEventListener("click", (event) => {
    const anchor = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
    if (!anchor?.href) return;
    const opensNewContext = anchor.target === "_blank" || event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey;
    if (!shouldBlock(anchor.href, opensNewContext)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    record(
      anchor.href,
      opensNewContext ? "popup-link" : "blocklist-link",
      opensNewContext ? "Cross-origin link from a protected site" : "Matched your domain blocklist",
      opensNewContext
    );
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const targetUrl = new URL(form.action || location.href, location.href).href;
    const opensNewContext = form.target === "_blank";
    if (!shouldBlock(targetUrl, opensNewContext)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    record(targetUrl, "form", "Cross-origin form target from a protected site", opensNewContext);
  }, true);

  function shouldBlock(targetUrl, popup) {
    if (!settings?.enabled) return false;
    let target;
    try {
      target = new URL(targetUrl, location.href);
    } catch {
      return false;
    }
    if (!["http:", "https:"].includes(target.protocol)) return false;
    const targetHost = normalizeHost(target.hostname);
    if (matches(targetHost, settings.allowlist)) return false;
    if (matches(targetHost, settings.blocklist)) return true;
    const protectedPage = matches(normalizeHost(location.hostname), settings.protectedSites);
    return Boolean(popup && settings.blockCrossOriginPopups && protectedPage && target.origin !== location.origin);
  }

  function normalizeHost(value) {
    return String(value || "").toLowerCase().replace(/^www\./, "").replace(/^\.+|\.+$/g, "");
  }

  function matches(host, patterns = []) {
    return patterns.some((pattern) => host === pattern || host.endsWith(`.${pattern}`));
  }

  function record(targetUrl, kind, reason, popup) {
    chrome.runtime.sendMessage({
      type: "recordAttempt",
      sourceUrl: location.href,
      targetUrl,
      kind,
      reason,
      popup
    }).catch(() => {});
  }
})();
