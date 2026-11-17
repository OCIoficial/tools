# Especificación: seguridad y acceso a Google

## Contexto

Aplicación de mail merge de **uso personal**, ejecutada íntegramente en el navegador
(TypeScript, sitio estático). **No hay backend**: toda la comunicación con Google se
hace directamente desde el cliente.

## 1. Proyecto en Google Cloud

| Configuración | Valor |
|---|---|
| Tipo de usuario (*User type*) | **External** |
| Estado de publicación | **Testing** (permanente) |
| Usuarios de prueba | Solo las cuentas propias que usarán la app (máx. 100) |
| Verificación de Google / auditoría CASA | **No requerida** (no aplica en modo Testing) |

## 2. Permisos (scopes) de OAuth

| Scope | Clasificación | Uso |
|---|---|---|
| `https://www.googleapis.com/auth/drive.readonly` | Restricted | Leer planillas, archivos y árboles de carpetas de Drive (cubre también la lectura vía Sheets API) |
| `https://www.googleapis.com/auth/gmail.send` | Sensitive | Enviar los correos |

- Se solicita el **mínimo** de permisos: solo lectura en Drive y solo envío en Gmail.
- No se solicita `spreadsheets.readonly` por separado, porque `drive.readonly` ya permite leer planillas.
- Si en el futuro se necesitan borradores en vez de envío directo, habrá que agregar
  `gmail.compose` (clasificado como **restricted**; no cambia nada en modo Testing) y actualizar
  este documento.

## 3. Flujo de autenticación

- Se usa **Google Identity Services** en modo *token* (`google.accounts.oauth2.initTokenClient`).
- **No se usa client secret** ni *authorization code flow*; no existen *refresh tokens*.
- El *access token* tiene una duración corta que fija Google y puede variar; se usa el valor
  `expires_in` de la respuesta, sin asumir una duración fija.
- Al expirar se pide uno nuevo con `requestAccessToken({ prompt: '' })`, que solo pide
  consentimiento la primera vez. Igual se abre una ventana emergente (se cierra sola si la
  autorización sigue vigente), por lo que la solicitud se hace desde una acción del usuario
  (p. ej. un botón) para que el navegador no la bloquee.
- Los permisos se piden de una sola vez al iniciar sesión. Es una decisión consciente: Google
  recomienda autorización incremental, pero para uso personal se prefiere un solo consentimiento.
- Al cerrar sesión se revoca el token con `google.accounts.oauth2.revoke`.

## 4. Manejo del token

- El *access token* se guarda **solo en memoria**. Nunca va en `localStorage`,
  `sessionStorage`, IndexedDB ni cookies.
- Recargar la página implica pedir un token nuevo, mediante una acción del usuario.
- El token se envía únicamente a dominios de Google: a `*.googleapis.com` mediante el header
  `Authorization: Bearer`, y al Picker (iframe en `docs.google.com`) mediante `setOAuthToken`.
- No se cargan scripts de terceros que no sean de Google (GIS, Picker). Las dependencias
  van incluidas en el bundle.
- El contenido HTML generado por el usuario se muestra en un `<iframe sandbox>` sin
  `allow-scripts`, para que no pueda acceder al token.

## 5. Credenciales en el frontend

Todos estos valores son **públicos por diseño** y van incluidos en el bundle:

| Variable | Valor | Protección |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | OAuth Client ID (`xxxx.apps.googleusercontent.com`) | *Authorized JavaScript origins* + lista de usuarios de prueba |
| `VITE_GOOGLE_API_KEY` | API key para Google Picker | Restringida por *HTTP referrer* a los orígenes de la app más `https://docs.google.com/*` (el Picker se muestra en un iframe de ese dominio) y solo a la **Google Picker API** |
| `VITE_GOOGLE_APP_ID` | Número del proyecto de Cloud (para Picker `setAppId`) | Ninguna (identificador público) |

- En desarrollo se definen en `.env.local` (no versionado; plantilla en `.env.example`) y en el
  deploy como *Variables* del repositorio en GitHub Actions, para no dejarlos escritos en el código y poder cambiarlos con facilidad,
  no para ocultarlos.
- **Nunca** se genera ni se incluye un *client secret* en el repositorio ni en el frontend.

## 6. Orígenes autorizados

Configurados en el OAuth Client ID y en las restricciones de la API key:

- `http://localhost:5173` (desarrollo)
- El origen de GitHub Pages: `https://<usuario>.github.io`, o el dominio propio de la organización
  (por ejemplo `https://www.olimpiada-informatica.cl`). En el OAuth Client ID va solo el origen; en la
  API key, la URL de la app con `/*` (por ejemplo `https://www.olimpiada-informatica.cl/mailmerge/*`)

Los orígenes deben usar HTTPS; `localhost` es la única excepción. Google rechaza las
solicitudes de autorización desde cualquier otro origen (error `origin_mismatch`).

## 7. APIs habilitadas en el proyecto

- Google Drive API
- Google Sheets API
- Gmail API
- Google Picker API
