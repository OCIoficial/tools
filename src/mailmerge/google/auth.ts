import { googleConfig } from '../config.ts'
import { loadScript } from './loadScript.ts'

// Ver docs/spec-acceso-google.md, sección 2.
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.send',
]

export interface AccessToken {
  value: string
  expiresAt: number
}

let tokenClient: google.accounts.oauth2.TokenClient | null = null
let pending: {
  resolve: (token: AccessToken) => void
  reject: (error: Error) => void
} | null = null

async function getTokenClient() {
  if (tokenClient) return tokenClient
  await loadScript('https://accounts.google.com/gsi/client')
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: googleConfig.clientId,
    scope: SCOPES.join(' '),
    prompt: '',
    callback: (response) => {
      const current = pending
      pending = null
      if (!current) return
      if (response.error) {
        current.reject(new Error(response.error_description ?? response.error))
      } else if (!google.accounts.oauth2.hasGrantedAllScopes(response, SCOPES[0], ...SCOPES.slice(1))) {
        current.reject(new Error('Not all required permissions were granted. Sign in again and accept all of them.'))
      } else {
        current.resolve({
          value: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in) * 1000,
        })
      }
    },
    error_callback: (error) => {
      const current = pending
      pending = null
      current?.reject(
        new Error(error.type === 'popup_closed' ? 'The Google window was closed.' : error.message),
      )
    },
  })
  return tokenClient
}

/** Debe llamarse desde una acción del usuario (abre una ventana emergente). */
export async function requestAccessToken(): Promise<AccessToken> {
  const client = await getTokenClient()
  return new Promise((resolve, reject) => {
    pending?.reject(new Error('Request replaced by a newer one.'))
    pending = { resolve, reject }
    client.requestAccessToken()
  })
}

export function revokeAccessToken(token: string): Promise<void> {
  return new Promise((resolve) => google.accounts.oauth2.revoke(token, resolve))
}
