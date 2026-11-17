import { useSyncExternalStore } from 'react'

/**
 * Minimal path router. Every app has a real URL (BASE + "mailmerge/", BASE + "credentials/"), and
 * the build writes a copy of index.html at each of them (see vite.config.ts), so reloading or
 * opening a link works on a static host. Moving between apps uses the History API and never
 * reloads the page, which keeps the in-memory Google sign-in.
 */

/** Site root: "/tools/" on GitHub Pages, "/" in development. Always ends with "/". */
export const BASE = import.meta.env.BASE_URL

/**
 * Routes are written relative to BASE, without slashes at either end: "", "mailmerge",
 * "mailmerge/review".
 */
export const routeHref = (path: string) => BASE + (path ? `${path}/` : '')

function readPath(): string {
  const { pathname } = window.location
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname
  return rest.replace(/(^|\/)index\.html$/, '').replace(/^\/+|\/+$/g, '')
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

export function navigate(path: string, { replace = false } = {}) {
  const href = routeHref(path)
  if (href !== window.location.pathname) {
    if (replace) history.replaceState(null, '', href)
    else history.pushState(null, '', href)
  }
  for (const listener of listeners) listener()
}

/** The current route, e.g. "mailmerge/review". */
export function usePath(): string {
  return useSyncExternalStore(subscribe, readPath)
}
