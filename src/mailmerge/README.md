# Mail Merge

Aplicación de mail merge que corre íntegramente en el navegador (Vite + React + TypeScript),
integrada con Google y publicada en GitHub Pages.

## Desarrollo

Requiere Node 22.

```sh
cp .env.example .env.local   # completar con los valores del proyecto de Google Cloud
npm install
npm run dev                  # http://localhost:5173
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Chequeo de tipos y build de producción en `dist/` |
| `npm run lint` | Oxlint |
| `npm run preview` | Sirve `dist/` localmente |

## Configurar Google Cloud

La app necesita tres valores de un proyecto de Google Cloud: un **OAuth Client ID**, una
**API key** y el **número del proyecto**. Todos se crean desde
[console.cloud.google.com](https://console.cloud.google.com).

### 1. Crear el proyecto y habilitar las APIs

1. Crear un proyecto nuevo (selector de proyectos → **New project**).
2. En **APIs & Services → Library**, habilitar:
   - Google Drive API
   - Google Sheets API
   - Gmail API
   - Google Picker API

### 2. Configurar la pantalla de consentimiento (Google Auth Platform)

1. Ir a **Google Auth Platform** (o **APIs & Services → OAuth consent screen**) y completar
   **Branding**: nombre de la app y correo de soporte.
2. En **Audience**:
   - **User type:** External.
   - **Publishing status:** dejar en **Testing**.
   - **Test users:** agregar los correos que usarán la app (máximo 100).
3. En **Data Access**, agregar los scopes:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/gmail.send`

En modo Testing no se requiere verificación de Google. Al iniciar sesión aparecerá la advertencia
"Google no ha verificado esta app", y la autorización caduca cada 7 días.

### 3. Crear el OAuth Client ID → `VITE_GOOGLE_CLIENT_ID`

1. En **Google Auth Platform → Clients** (o **APIs & Services → Credentials → Create credentials →
   OAuth client ID**), crear un cliente de tipo **Web application**.
2. En **Authorized JavaScript origins**, agregar:
   - `http://localhost:5173`
   - El origen donde se publica la app, solo el dominio y sin la ruta del repositorio:
     `https://<usuario>.github.io`, o el dominio propio de la organización si tiene uno
     (por ejemplo `https://www.olimpiada-informatica.cl`).
3. **Authorized redirect URIs** se deja vacío.
4. Copiar el **Client ID** (`xxxx.apps.googleusercontent.com`). El *client secret* no se usa:
   no hay que copiarlo ni guardarlo en ninguna parte.

### 4. Crear la API key → `VITE_GOOGLE_API_KEY`

1. En **APIs & Services → Credentials → Create credentials → API key**, crear la key.
   - En **Select API restrictions**, elegir solo **Google Picker API**. Si no aparece, falta
     habilitarla (paso 1).
   - Si aparece la opción de autenticar mediante una *service account*, dejarla desmarcada.
2. Editar la key y en **Application restrictions → Websites** agregar:
   - `http://localhost:5173/*`
   - La URL de la app con `/*` al final: `https://<usuario>.github.io/<repo>/*`, o con el dominio
     propio (por ejemplo `https://www.olimpiada-informatica.cl/mailmerge/*`)
   - `https://docs.google.com/*` (requerido: el Picker se muestra en un iframe de ese dominio)

### 5. Obtener el número del proyecto → `VITE_GOOGLE_APP_ID`

Está en **IAM & Admin → Settings** (o en el panel de inicio del proyecto) como **Project number**.
Es un número; no confundirlo con el *Project ID*, que es texto.

Con los tres valores, completar `.env.local` para desarrollo y las *Variables* del repositorio
para el deploy (ver abajo).

## Deploy en GitHub Pages

El workflow `.github/workflows/deploy.yml` construye y publica la app en cada push a `main`.

Configuración inicial (una sola vez):

1. **Settings → Pages → Source:** GitHub Actions.
2. **Settings → Secrets and variables → Actions → Variables:** crear `VITE_GOOGLE_CLIENT_ID`,
   `VITE_GOOGLE_API_KEY` y `VITE_GOOGLE_APP_ID`. Son valores públicos, por eso van como
   *Variables* y no como *Secrets*.
3. En Google Cloud, verificar que el origen de GitHub Pages esté autorizado en el OAuth Client ID
   y en la API key (ver [Configurar Google Cloud](#configurar-google-cloud)).
