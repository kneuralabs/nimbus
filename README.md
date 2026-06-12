# Nimbus — Cloud Storage (demo)

A zero-backend, browser-only file manager served as a static site via GitHub
Pages at `nimbus.kneuralabs.com` (see `CNAME`). All data lives in the
visitor's own browser; there is no server component.

## Layout

| Path | Role |
|---|---|
| `index.html` | Markup plus two intentionally-inline boot scripts (see below) |
| `assets/css/app.css` | All styles (app shell, SSO gate, modals, themes) |
| `assets/js/app.js` | File manager: IndexedDB persistence, rendering, upload/preview/share/trash, optional GitHub sync |
| `assets/js/sso.js` | Sign-in gate: client-side user store, password screens, session handling |
| `assets/img/demo-thumb.png` | Thumbnail for the pre-rendered placeholder card in `index.html` |
| `LOGO.png` | Brand logo, referenced by both the gate and the topbar |

Load order matters: `app.js` must precede `sso.js` (the gate markup calls
`showToast`, defined in `app.js`).

## Inline scripts that must stay inline

1. **SSO bootstrap** (top of `<head>`): decides whether to redirect to
   `sso.kneuralabs.com` *before anything renders*. Moving it to an external
   file would add a network round-trip before the redirect decision and
   flash unauthenticated content.
2. **Gate-hide snippet** (inside `#sso-gate`): hides the gate synchronously
   for already-signed-in visitors to avoid a login-screen flash. It uses
   `document.currentScript`, which only works inline.

Both scripts deliberately duplicate the tiny `validSession` check from
`sso.js` — they run before any external script has loaded.

## Data flow

1. `<head>` bootstrap: consume `?kn-auth=<base64 JSON>` from the SSO
   round-trip → store session in `sessionStorage` (`kn-sso-session`) →
   scrub the URL. No session and no auth param → redirect to SSO (with a
   2-bounce circuit breaker against redirect loops).
2. `sso.js` boot: valid session hides the gate and populates the avatar;
   otherwise the in-page sign-in gate renders. The user store is the
   code-defined `USERS` seed merged with per-browser deltas persisted in
   `localStorage` (`kn-users-overrides-v1`).
3. `app.js` boot: open IndexedDB `nimbus_v3`, load all file records (each
   record carries its full `dataUrl`), render. Every mutation writes the
   record back via `dbPut` and re-renders.
4. Optional GitHub sync: a personal access token saved in `localStorage`
   (`nimbus-gh`) lets the gold dot commit every non-deleted file to
   `storage/<name>` in a chosen repo via the GitHub contents API.

## Known limitations (by design of the demo)

- Authentication is client-side only and advisory: the seed user table
  (SHA-256 password hashes) and the default password ship in `sso.js`,
  and a session is just a `sessionStorage` entry anyone can write.
  Do not store anything sensitive behind this gate.
- The GitHub PAT is kept in plaintext `localStorage`; use a fine-grained
  token scoped to the single target repo.
- Files are stored as base64 `dataUrl` strings and held in memory, so
  practical capacity is far below the displayed "5 GB" quota.
