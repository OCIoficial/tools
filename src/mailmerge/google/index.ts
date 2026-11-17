/**
 * The only entry point to Google from the rest of the app. Only files inside a `google/` folder
 * call the network or use Google's scripts; the linter (.oxlintrc.json) enforces it.
 */
export { AuthError } from './api.ts'
export { SendLimitError, UnconfirmedSendError } from './gmail.ts'
export { GoogleProvider, useGoogle, type Drive, type Google } from './GoogleProvider.tsx'
