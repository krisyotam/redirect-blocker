# Redirect Blocker

Redirect Blocker is a privacy-first Chrome and Edge extension that blocks unwanted cross-origin popups on sites you choose, remembers every blocked destination locally, and lets you turn redirect history into a reusable domain blocklist.

![Redirect Blocker icon](icons/icon-128.png)

## Features

- Protect individual sites from cross-origin popup tabs, `_blank` links, forms, and `window.open` calls.
- Store a local audit trail with the source URL, blocked destination, timestamp, event type, and reason.
- Search and filter redirect history.
- Export the current history view as JSON, CSV, or a deduplicated newline-separated URL file.
- Add one destination—or every destination in a filtered view—to the browser-level domain blocklist.
- Enforce the blocklist with Chrome's Declarative Net Request API for top-level pages and frames.
- Keep all settings and history on-device; there are no analytics or remote services.

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository's root folder (the folder containing `manifest.json`).

The dashboard opens after installation. Visit a site, click the extension icon, and choose **Protect site**. Cross-origin popup attempts from that site will be blocked and added to Redirect history.

## Export and block destinations

Open **history & blocklist** from the popup. The dashboard can export:

- `redirect-history.json` — complete structured records.
- `redirect-history.csv` — records suitable for a spreadsheet.
- `redirect-urls.txt` — unique full destination URLs, one per line.

Use **Block domain** beside an entry or **Block all shown domains** to enforce those destinations through the browser's request-blocking engine. The text blocklist accepts a hostname or URL per line and automatically covers subdomains.

## Protection model

Redirect Blocker intentionally distinguishes two controls:

- **Protected sites**: cross-origin popups are blocked only when launched from a site on this list. This avoids breaking normal sign-in and payment popups across the entire web.
- **Domain blocklist**: navigation to these domains is blocked everywhere, including frames. Allowlisted domains take precedence during page-level popup checks; remove a domain from the blocklist to permit browser-level navigation again.

Browser extensions cannot reliably distinguish every server-directed redirect from an intentional navigation without inspecting or blocking more traffic. This extension records destinations it actually blocks: page-created popup attempts, new popup tabs, blocklisted links/forms, and blocklist navigation errors exposed by the browser.

## Development

The project has no runtime dependencies and no build step.

```sh
npm test
npm run check
```

After editing source files, reload the unpacked extension from the extensions page.

## Permissions

- `storage`: keep local settings and redirect history.
- `tabs`: identify and close unwanted popup tabs.
- `webNavigation`: record blocklist navigation failures.
- `declarativeNetRequest`: enforce the user-managed domain blocklist.
- `<all_urls>`: run page protection on sites the user chooses and apply blocklist rules.

See [PRIVACY.md](PRIVACY.md) for the privacy policy.

## License

MIT
