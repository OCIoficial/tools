# Google Cloud setup

The Google sign-in is shared by every app of the site (`src/shared/google`); today only Mail Merge
uses it. It needs three values from a Google Cloud project: an **OAuth Client ID**, an **API key**
and the **project number**. All of them are created from
[console.cloud.google.com](https://console.cloud.google.com).

For development, copy `.env.example` to `.env.local` and fill it in with these values (see the
root [README](../README.md)).

## 1. Create the project and enable the APIs

1. Create a new project (project picker → **New project**).
2. In **APIs & Services → Library**, enable:
   - Google Drive API
   - Google Sheets API
   - Gmail API
   - Google Picker API

## 2. Configure the consent screen (Google Auth Platform)

1. Go to **Google Auth Platform** (or **APIs & Services → OAuth consent screen**) and fill in
   **Branding**: app name and support email.
2. In **Audience**:
   - **User type:** External.
   - **Publishing status:** leave it in **Testing**.
   - **Test users:** add the email addresses that will use the app (100 at most).
3. In **Data Access**, add the scopes:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/gmail.send`

In Testing mode no Google verification is required. When signing in, the warning
"Google hasn't verified this app" will show up, and the authorization expires every 7 days.

## 3. Create the OAuth Client ID → `VITE_GOOGLE_CLIENT_ID`

1. In **Google Auth Platform → Clients** (or **APIs & Services → Credentials → Create credentials →
   OAuth client ID**), create a client of type **Web application**.
2. In **Authorized JavaScript origins**, add:
   - `http://localhost:5173`
   - The origin where the site is published, only the domain, without the `/tools/` path:
     `https://ocioficial.github.io`, or the organization's own domain if it has one
     (for example `https://www.olimpiada-informatica.cl`).
3. Leave **Authorized redirect URIs** empty.
4. Copy the **Client ID** (`xxxx.apps.googleusercontent.com`). The *client secret* is not used:
   there is no need to copy it or store it anywhere.

## 4. Create the API key → `VITE_GOOGLE_API_KEY`

1. In **APIs & Services → Credentials → Create credentials → API key**, create the key.
   - In **Select API restrictions**, choose only **Google Picker API**. If it does not show up,
     it still has to be enabled (step 1).
   - If the option to authenticate through a *service account* shows up, leave it unchecked.
2. Edit the key and in **Application restrictions → Websites** add:
   - `http://localhost:5173/*`
   - The site URL with `/*` at the end: `https://ocioficial.github.io/tools/*`, or with the
     organization's own domain (for example `https://www.olimpiada-informatica.cl/tools/*`)
   - `https://docs.google.com/*` (required: the Picker is shown in an iframe from that domain)

## 5. Get the project number → `VITE_GOOGLE_APP_ID`

It is in **IAM & Admin → Settings** (or in the project's dashboard) as **Project number**.
It is a number; do not confuse it with the *Project ID*, which is text.

With the three values, fill in `.env.local` for development and the repository *Variables*
for the deployment (see the "Deployment" section of the root [README](../README.md)).
