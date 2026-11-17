/**
 * The only entry point to Google from Credentials. Only files inside a `google/` folder call
 * Google's APIs or scripts; the linter (.oxlintrc.json) enforces it.
 */
import { useMemo } from 'react'
import { AuthError, missingConfig, useGoogleSession } from '../../shared/google/index.ts'
import { chooseFolder, uploadPdf, type DriveFolder } from './drive.ts'

export { AuthError, type DriveFolder }

export interface Drive {
  /** The Google configuration is complete (see .env.example). */
  available: boolean
  signedIn: boolean
  connecting: boolean
  signIn: () => Promise<void>
  /** Opens the Picker; null if cancelled. */
  pickFolder: () => Promise<DriveFolder | null>
  upload: (folder: DriveFolder, name: string, bytes: Uint8Array) => Promise<void>
}

export function useDrive(): Drive {
  const { signedIn, connecting, signIn, run } = useGoogleSession()
  return useMemo(
    (): Drive => ({
      available: missingConfig.length === 0,
      signedIn,
      connecting,
      signIn,
      pickFolder: () => run(chooseFolder),
      upload: (folder, name, bytes) => run((token) => uploadPdf(token, folder.id, name, bytes)),
    }),
    [signedIn, connecting, signIn, run],
  )
}

export const folderUrl = (folder: DriveFolder) => `https://drive.google.com/drive/folders/${folder.id}`
