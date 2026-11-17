# Spec: security and access to Google

## Context

**OCI Tools** is a multi-app site (Mail Merge and Credentials), run entirely in the browser
(TypeScript, static site) and published at <https://ocioficial.github.io/tools/>, with one route
per app (`/tools/mailmerge/`, `/tools/credentials/`). **There is no backend**: all communication
with Google happens directly from the client. The Google sign-in (`src/shared/google`) is shared
by every app; today only Mail Merge uses it.

## 1. Google Cloud project

| Setting | Value |
|---|---|
| *User type* | **External** |
| Publishing status | **Testing** (permanent) |
| Test users | Only the organization's own accounts that will use the apps (100 at most) |
| Google verification / CASA audit | **Not required** (does not apply in Testing mode) |

## 2. OAuth permissions (scopes)

| Scope | Classification | Use |
|---|---|---|
| `https://www.googleapis.com/auth/drive.readonly` | Restricted | Read spreadsheets, files and folder trees from Drive (also covers reading through the Sheets API) |
| `https://www.googleapis.com/auth/gmail.send` | Sensitive | Send the emails |

- The **minimum** permissions are requested: read-only in Drive and send-only in Gmail.
- `spreadsheets.readonly` is not requested separately, because `drive.readonly` already allows
  reading spreadsheets.
- If drafts are needed in the future instead of sending directly, `gmail.compose` will have to be
  added (classified as **restricted**; nothing changes in Testing mode) and this document updated.
- The scopes of every app are listed together in `SCOPES` (`src/shared/google/auth.ts`). An app
  that needs a new scope adds it there and to this table.

## 3. Authentication flow

- **Google Identity Services** is used in *token* mode (`google.accounts.oauth2.initTokenClient`).
- **No client secret** and no *authorization code flow* are used; there are no *refresh tokens*.
- The *access token* has a short lifetime set by Google, which may vary; the `expires_in` value
  from the response is used, without assuming a fixed lifetime.
- When it expires a new one is requested with `requestAccessToken({ prompt: '' })`, which only asks
  for consent the first time. A popup still opens (it closes by itself if the authorization is
  still valid), so the request is made from a user action (e.g. a button) so the browser does
  not block it.
- The permissions of all apps are requested at once when signing in. It is a deliberate choice:
  Google recommends incremental authorization, but for a small internal tool a single consent is
  preferred, and it lets the user move between apps without new prompts.
- Signing out revokes the token with `google.accounts.oauth2.revoke`.

## 4. Token handling

- The *access token* is stored **in memory only**. It never goes in `localStorage`,
  `sessionStorage`, IndexedDB or cookies.
- Reloading the page signs the user out: a new token has to be requested, through a user action.
  Moving between apps does not reload the page, so the sign-in is kept.
- The token is sent only to Google domains: to `*.googleapis.com` through the
  `Authorization: Bearer` header, and to the Picker (iframe on `docs.google.com`) through
  `setOAuthToken`.
- No third-party scripts other than Google's (GIS, Picker) are loaded. Dependencies are included
  in the bundle.
- User-generated HTML content is shown in an `<iframe sandbox>` without `allow-scripts`, so it
  cannot access the token.

## 5. Credentials in the frontend

All these values are **public by design** and are included in the bundle:

| Variable | Value | Protection |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | OAuth Client ID (`xxxx.apps.googleusercontent.com`) | *Authorized JavaScript origins* + test users list |
| `VITE_GOOGLE_API_KEY` | API key for Google Picker | Restricted by *HTTP referrer* to the site URL plus `https://docs.google.com/*` (the Picker is shown in an iframe from that domain) and only to the **Google Picker API** |
| `VITE_GOOGLE_APP_ID` | Cloud project number (for Picker `setAppId`) | None (public identifier) |

- In development they are set in `.env.local` (not versioned; template in `.env.example`) and in
  the deployment as repository *Variables* in GitHub Actions, so they are not written in the code
  and can be changed easily, not to hide them.
- A *client secret* is **never** generated or included in the repository or the frontend.

## 6. Authorized origins

Configured in the OAuth Client ID and in the API key restrictions:

- `http://localhost:5173` (development)
- The GitHub Pages origin: `https://ocioficial.github.io`, or the organization's own domain
  (for example `https://www.olimpiada-informatica.cl`). The OAuth Client ID takes only the origin;
  the API key takes the site URL with `/*` (`https://ocioficial.github.io/tools/*`).

Origins must use HTTPS; `localhost` is the only exception. Google rejects authorization requests
from any other origin (`origin_mismatch` error).

## 7. APIs enabled in the project

- Google Drive API
- Google Sheets API
- Gmail API
- Google Picker API
