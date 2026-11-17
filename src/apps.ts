import { lazy, type ComponentType } from 'react'
import { CredentialsMark, MergeMark } from './appIcons.tsx'
import { BASE } from './shared/router.ts'

/** Props every app receives: the rest of the route after the app's own path. */
export interface AppProps {
  subpath: string
}

export interface AppInfo {
  /** First segment of the URL: BASE + path + "/". */
  path: string
  name: string
  description: string
  icon: ComponentType<{ size?: number }>
  favicon: { href: string; type: string }
  /** Loaded on demand: each app is its own bundle. */
  component: ComponentType<AppProps>
}

/**
 * The apps. They are independent: none imports from another, and the only state they share is
 * the Google sign-in (src/shared/google).
 */
export const APPS: AppInfo[] = [
  {
    path: 'mailmerge',
    name: 'Mail Merge',
    description: 'Send personalized emails with attachments from a spreadsheet, using your Gmail account.',
    icon: MergeMark,
    favicon: { href: `${BASE}mailmerge/favicon.svg`, type: 'image/svg+xml' },
    component: lazy(() => import('./mailmerge/App.tsx')),
  },
  {
    path: 'credentials',
    name: 'Credentials',
    description: 'Generate printable PDFs with contest login credentials from a CSV.',
    icon: CredentialsMark,
    favicon: { href: `${BASE}credentials/favicon.png`, type: 'image/png' },
    component: lazy(() => import('./credentials/App.tsx')),
  },
]
