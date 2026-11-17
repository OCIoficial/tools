import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useGoogleSession } from '../../shared/google/index.ts'
import { readArchive } from '../attachments/archive.ts'
import { zipTree } from '../attachments/resolve.ts'
import type { AttachmentTree, FileNode } from '../attachments/tree.ts'
import type { DriveOrigin, LoadProgress, SpreadsheetSource } from '../sources.ts'
import { getSheetValues, getSpreadsheet } from './api.ts'
import { downloadDriveFile, getDriveFileSize, loadDriveFile, loadDriveTree } from './drive.ts'
import { sendRawMessage } from './gmail.ts'
import { pickArchive, pickFiles, pickFolder, pickSpreadsheet } from './picker.ts'

type OnProgress = (progress: LoadProgress) => void

/**
 * Drive files for the attachments. Choosing and loading are separate: with the source
 * saved, "Reload" loads the same thing again without opening the picker.
 */
export interface Drive {
  /** null if cancelled. */
  pickFolder(): Promise<DriveOrigin | null>
  pickArchive(): Promise<DriveOrigin | null>
  pickFiles(): Promise<DriveOrigin[] | null>
  /** Folder or archive, as a tree (for the paths). */
  loadTree(origin: DriveOrigin, onProgress: OnProgress): Promise<AttachmentTree>
  /** Single file, or folder compressed into a ZIP (to attach to every email). */
  loadFile(origin: DriveOrigin, onProgress: OnProgress): Promise<FileNode>
}

/**
 * Everything the app uses from Google. The token never leaves this file: the components ask
 * "choose a spreadsheet" or "send this message", they do not call the APIs.
 */
export interface Google {
  signedIn: boolean
  email: string | null
  connecting: boolean
  /** Error from the last sign-in. */
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  spreadsheets: SpreadsheetSource
  drive: Drive
  /** Sends an already built message (RFC 5322) from the signed-in account. */
  sendMessage: (message: Uint8Array) => Promise<void>
}

const GoogleContext = createContext<Google | null>(null)

export function GoogleProvider({ children }: { children: ReactNode }) {
  const { signedIn, email, connecting, error, signIn, signOut, run } = useGoogleSession()

  const value = useMemo((): Google => {
    const spreadsheets: SpreadsheetSource = {
      canReload: true,
      async pick() {
        const picked = await run(pickSpreadsheet)
        return picked && run((token) => getSpreadsheet(token, picked.id))
      },
      loadSheet: (spreadsheet, sheet) => run((token) => getSheetValues(token, spreadsheet.id, sheet)),
    }

    const readFolder = (folder: DriveOrigin, onProgress: OnProgress) => {
      onProgress({ message: `Reading ${folder.name}…` })
      return run((token) =>
        loadDriveTree(token, folder, (progress) =>
          onProgress(
            progress.phase === 'listing'
              ? { message: `Reading ${folder.name}… ${progress.files} files found` }
              : { message: `Downloading ${folder.name}`, done: progress.done, total: progress.total, unit: 'files' },
          ),
        ),
      )
    }

    const drive: Drive = {
      pickFolder: async () => {
        const folder = await run(pickFolder)
        return folder && { kind: 'drive-folder', id: folder.id, name: folder.name }
      },
      pickArchive: async () => {
        const file = await run(pickArchive)
        return file && { kind: 'drive-archive', id: file.id, name: file.name }
      },
      pickFiles: async () => {
        const files = await run(pickFiles)
        return files && files.map((file) => ({ kind: 'drive-file', ...file }))
      },

      async loadTree(origin, onProgress) {
        if (origin.kind === 'drive-folder') return readFolder(origin, onProgress)
        if (origin.kind !== 'drive-archive') throw new Error(`"${origin.name}" is not a folder or an archive.`)
        const message = `Downloading ${origin.name}`
        onProgress({ message })
        // The size comes from the file's metadata: it does not depend on Content-Length in the download.
        const total = (await run((token) => getDriveFileSize(token, origin.id))) ?? undefined
        const data = await run((token) =>
          downloadDriveFile(token, origin.id, (done) => onProgress({ message, done, total, unit: 'bytes' })),
        )
        onProgress({ message: `Reading ${origin.name}…` })
        return readArchive(origin.name, data)
      },

      async loadFile(origin, onProgress) {
        if (origin.kind === 'drive-folder') {
          const tree = await readFolder(origin, onProgress)
          onProgress({ message: `Compressing ${origin.name}…` })
          return zipTree(tree)
        }
        if (origin.kind !== 'drive-file') throw new Error(`"${origin.name}" is not a file or a folder.`)
        const message = `Downloading ${origin.name}`
        onProgress({ message })
        return run((token) =>
          loadDriveFile(token, origin, (done, total) => onProgress({ message, done, total, unit: 'bytes' })),
        )
      },
    }

    return {
      signedIn,
      email,
      connecting,
      error,
      signIn,
      signOut,
      spreadsheets,
      drive,
      sendMessage: async (message) => {
        await run((token) => sendRawMessage(token, message))
      },
    }
  }, [signedIn, email, connecting, error, signIn, signOut, run])

  return <GoogleContext.Provider value={value}>{children}</GoogleContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useGoogle(): Google {
  const context = useContext(GoogleContext)
  if (!context) throw new Error('useGoogle must be used inside GoogleProvider')
  return context
}
