(() => {
  const originalOpen = window.open;
  window.open = function redirectBlockerOpen(url, target, features) {
    if (url != null) {
      const event = new CustomEvent("redirect-blocker:window-open", {
        cancelable: true,
        detail: { targetUrl: String(url) }
      });
      if (!document.dispatchEvent(event)) return null;
    }
    return originalOpen.call(window, url, target, features);
  };
})();
