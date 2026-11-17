import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { requestAccessToken, revokeAccessToken, type AccessToken } from './auth.ts'
import { AuthError } from './errors.ts'

/**
 * The Google sign-in shared by every app: the only state apps have in common. The token lives
 * in memory only, so reloading the page signs the user out.
 */
export interface GoogleSession {
  signedIn: boolean
  email: string | null
  connecting: boolean
  /** Error from the last sign-in attempt. */
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  /**
   * Runs a call that needs the access token. If the token expired or Google rejects it
   * (AuthError), the session is closed locally and the error is rethrown.
   */
  run: <T>(call: (token: string) => Promise<T>) => Promise<T>
}

const SessionContext = createContext<GoogleSession | null>(null)

async function getUserEmail(token: string): Promise<string> {
  const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) throw new AuthError('Your Google session expired. Sign in again.')
  if (!response.ok) throw new Error(`Google API error ${response.status}`)
  const about = (await response.json()) as { user: { emailAddress: string } }
  return about.user.emailAddress
}

export function GoogleSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<AccessToken | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      const next = await requestAccessToken()
      setToken(next)
      setEmail(await getUserEmail(next.value))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setConnecting(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    if (token) await revokeAccessToken(token.value)
    setToken(null)
    setEmail(null)
  }, [token])

  const run = useCallback(
    async <T,>(call: (token: string) => Promise<T>): Promise<T> => {
      if (!token || token.expiresAt <= Date.now()) {
        setToken(null)
        throw new AuthError('Your Google session expired. Sign in again.')
      }
      try {
        return await call(token.value)
      } catch (e) {
        if (e instanceof AuthError) setToken(null)
        throw e
      }
    },
    [token],
  )

  const value = useMemo(
    (): GoogleSession => ({ signedIn: token !== null, email, connecting, error, signIn, signOut, run }),
    [token, email, connecting, error, signIn, signOut, run],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useGoogleSession(): GoogleSession {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useGoogleSession must be used inside GoogleSessionProvider')
  return context
}
