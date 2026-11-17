/**
 * The only entry point to the shared Google sign-in. Only files inside a `google/` folder call
 * the network or use Google's scripts; the linter (.oxlintrc.json) enforces it.
 */
export { googleConfig, missingConfig } from './config.ts'
export { AuthError } from './errors.ts'
export { loadScript } from './loadScript.ts'
export { GoogleSessionProvider, useGoogleSession, type GoogleSession } from './session.tsx'
