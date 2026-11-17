export const googleConfig = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY ?? '',
  appId: import.meta.env.VITE_GOOGLE_APP_ID ?? '',
}

export const missingConfig = Object.entries({
  VITE_GOOGLE_CLIENT_ID: googleConfig.clientId,
  VITE_GOOGLE_API_KEY: googleConfig.apiKey,
  VITE_GOOGLE_APP_ID: googleConfig.appId,
})
  .filter(([, value]) => !value)
  .map(([name]) => name)
