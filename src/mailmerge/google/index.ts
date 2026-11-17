/**
 * Única entrada a Google desde el resto de la app. Solo los archivos de src/google llaman a la
 * red o usan los scripts de Google; el lint (.oxlintrc.json) lo exige.
 */
export { AuthError } from './api.ts'
export { SendLimitError, UnconfirmedSendError } from './gmail.ts'
export { GoogleProvider, useGoogle, type Drive, type Google } from './GoogleProvider.tsx'
