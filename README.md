# OCI Tools

Web tools for organizing the Chilean Olympiad in Informatics (OCI). They run entirely in the
browser (Vite + React + TypeScript + Mantine) and are published on GitHub Pages:

| App | URL | What it does |
|---|---|---|
| [Mail Merge](docs/google-cloud-setup.md) | `/tools/mailmerge/` | Send personalized emails with attachments from a spreadsheet, through Gmail. |
| [Credentials](src/credentials/README.md) | `/tools/credentials/` | Generate printable PDFs with contest login credentials from a CSV. |

The older command-line tools (CMS scripts, the credentials TUI, …) are kept in [`legacy/`](legacy).

## Structure

It is a single-page app with one route per app:

```
index.html            shell shared by every page
src/
  main.tsx            Mantine, the Google sign-in and the router
  Root.tsx            picks the page for the current URL
  apps.ts             list of apps (name, icon, route); each one is loaded on demand
  shared/             header, theme, router and the Google sign-in (src/shared/google)
  landing/            the page at the root, with a card per app
  mailmerge/          Mail Merge
  credentials/        Credentials
public/<app>/         static files of each app (favicon, fonts, …)
```

The apps are independent: neither imports from the other, and each keeps its data in its own
store. The only thing they share is the Google sign-in. Every scope any app needs is requested
when signing in, and the token is kept in memory only, so reloading the page signs the user out
(see [docs/google-access.md](docs/google-access.md)).

Moving between apps does not reload the page, so the sign-in is kept. Each app has a real URL
(`/tools/mailmerge/`, `/tools/mailmerge/review/`, `/tools/credentials/`): the build writes a copy
of `index.html` at each of them (see `vite.config.ts`), so a reload or a shared link works on
GitHub Pages without redirects.

To add an app: create `src/<app>/App.tsx` (default export, receives `AppProps`), add it to
`src/apps.ts`, and add its routes to `ROUTES` in `vite.config.ts`.

## Development

Requires Node 22.

```sh
cp .env.example .env.local   # fill in the Google Cloud values (docs/google-cloud-setup.md)
npm install
npm run dev                  # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type check and production build in `dist/` |
| `npm run lint` | Oxlint |
| `npm test` | Unit tests (Vitest) |
| `npm run preview` | Serves `dist/` locally |

## Deployment

`.github/workflows/deploy.yml` runs the checks (`ci.yml`), builds the site and publishes it to
GitHub Pages on every push to `main`. The base path (`/tools/`) comes from the Pages settings.

One-time setup:

1. **Settings → Pages → Source:** GitHub Actions.
2. **Settings → Secrets and variables → Actions → Variables:** create `VITE_GOOGLE_CLIENT_ID`,
   `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID`. They are public values, so they go in
   *Variables*, not *Secrets*.
3. In Google Cloud, authorize the GitHub Pages origin in the OAuth client and the site URL in the
   API key (see [docs/google-cloud-setup.md](docs/google-cloud-setup.md)).
