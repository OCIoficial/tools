import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { readArchive } from '../attachments/archive.ts'
import { zipTree } from '../attachments/resolve.ts'
import type { AttachmentTree, FileNode } from '../attachments/tree.ts'
import type { DriveOrigin, LoadProgress, SpreadsheetSource } from '../sources.ts'
import { AuthError, getSheetValues, getSpreadsheet, getUserEmail } from './api.ts'
import { requestAccessToken, revokeAccessToken, type AccessToken } from './auth.ts'
import { downloadDriveFile, getDriveFileSize, loadDriveFile, loadDriveTree } from './drive.ts'
import { sendRawMessage } from './gmail.ts'
import { pickArchive, pickFiles, pickFolder, pickSpreadsheet } from './picker.ts'

type OnProgress = (progress: LoadProgress) => void

/**
 * Archivos de Drive para los adjuntos. Elegir y cargar van por separado: con el origen
 * guardado, "Reload" vuelve a cargar lo mismo sin abrir el selector.
 */
export interface Drive {
  /** null si se cancela. */
  pickFolder(): Promise<DriveOrigin | null>
  pickArchive(): Promise<DriveOrigin | null>
  pickFiles(): Promise<DriveOrigin[] | null>
  /** Carpeta o archivo comprimido, como árbol (para las rutas). */
  loadTree(origin: DriveOrigin, onProgress: OnProgress): Promise<AttachmentTree>
  /** Archivo suelto, o carpeta comprimida en un ZIP (para adjuntar a todos). */
  loadFile(origin: DriveOrigin, onProgress: OnProgress): Promise<FileNode>
}

/**
 * Todo lo que la app usa de Google. El token nunca sale de aquí: los componentes piden
 * "elige una planilla" o "envía este mensaje", no llaman a las APIs.
 */
export interface Google {
  signedIn: boolean
  email: string | null
  connecting: boolean
  /** Error del último inicio de sesión. */
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  spreadsheets: SpreadsheetSource
  drive: Drive
  /** Envía un mensaje ya armado (RFC 5322) desde la cuenta conectada. */
  sendMessage: (message: Uint8Array) => Promise<void>
}

const GoogleContext = createContext<Google | null>(null)

export function GoogleProvider({ children }: { children: ReactNode }) {
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

  /** Ejecuta una llamada a Google; si el token expiró, cierra la sesión local. */
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
        // El tamaño viene de los datos del archivo: no se depende de Content-Length en la descarga.
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
      signedIn: token !== null,
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
  }, [token, email, connecting, error, signIn, signOut, run])

  return <GoogleContext.Provider value={value}>{children}</GoogleContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useGoogle(): Google {
  const context = useContext(GoogleContext)
  if (!context) throw new Error('useGoogle must be used inside GoogleProvider')
  return context
}
