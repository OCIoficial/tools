import { buildTree, fileNode, formatSize, type AttachmentTree, type FileNode, type TreeEntry } from '../attachments/tree.ts'
import { AuthError } from './api.ts'

const FOLDER = 'application/vnd.google-apps.folder'
const SHORTCUT = 'application/vnd.google-apps.shortcut'
/** Native Google files, which are attached exported to PDF. */
const EXPORTABLE = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
])

interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  shortcutDetails?: { targetId: string; targetMimeType: string }
}

async function driveFetch(token: string, url: string): Promise<Response> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (response.status === 401) throw new AuthError('Your Google session expired. Sign in again.')
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message ?? `Google Drive error ${response.status}`)
  }
  return response
}

async function listChildren(token: string, folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size, shortcutDetails)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const page = (await (await driveFetch(token, `https://www.googleapis.com/drive/v3/files?${params}`)).json()) as {
      files: DriveFile[]
      nextPageToken?: string
    }
    files.push(...page.files)
    pageToken = page.nextPageToken
  } while (pageToken)
  return files
}

/** Cap on a folder's total: protects against choosing a huge folder by mistake. */
const MAX_FOLDER_SIZE = 200 * 1024 * 1024

/** Parallel requests to Drive (listing folders or downloading files), so as not to exceed the API quotas. */
const CONCURRENCY = 5

/** Runs fn on each element, with at most `limit` in parallel. */
async function forEachConcurrently<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

interface PendingFile {
  path: string
  id: string
  mimeType: string
  /** Native Google file (Docs, Sheets, Slides) that is exported to PDF. */
  exportPdf: boolean
  size: number
}

export type DriveTreeProgress =
  | { phase: 'listing'; files: number }
  | { phase: 'downloading'; done: number; total: number }

/**
 * Reads the whole folder and downloads all its files, so errors show up when loading it
 * and not in the middle of sending. Shortcuts are followed; native Google files that cannot
 * be exported to PDF are skipped. If any file fails, they are all reported together.
 */
export async function loadDriveTree(
  token: string,
  folder: { id: string; name: string },
  onProgress?: (progress: DriveTreeProgress) => void,
): Promise<AttachmentTree> {
  const pending: PendingFile[] = []
  const emptyDirs: string[] = []
  // Avoids cycles with shortcuts to folders that contain the shortcut.
  const visited = new Set<string>([folder.id])
  // One level of the tree at a time: the subfolders found make up the next level.
  let level = [{ id: folder.id, path: '' }]

  while (level.length > 0) {
    const nextLevel: typeof level = []
    await forEachConcurrently(level, CONCURRENCY, async (dir) => {
      const files = await listChildren(token, dir.id)
      if (files.length === 0 && dir.path) emptyDirs.push(dir.path)
      for (const file of files) {
        const id = file.shortcutDetails?.targetId ?? file.id
        const mimeType = file.mimeType === SHORTCUT ? (file.shortcutDetails?.targetMimeType ?? '') : file.mimeType
        const path = dir.path + file.name
        if (mimeType === FOLDER) {
          if (!visited.has(id)) {
            visited.add(id)
            nextLevel.push({ id, path: `${path}/` })
          }
        } else if (mimeType.startsWith('application/vnd.google-apps.')) {
          if (EXPORTABLE.has(mimeType)) pending.push({ path, id, mimeType, exportPdf: true, size: 0 })
        } else {
          pending.push({ path, id, mimeType, exportPdf: false, size: Number(file.size ?? 0) })
        }
      }
      onProgress?.({ phase: 'listing', files: pending.length })
    })
    level = nextLevel
  }

  // Exported files have no size until exported; the cap counts only the known ones.
  const knownSize = pending.reduce((sum, file) => sum + file.size, 0)
  if (knownSize > MAX_FOLDER_SIZE) {
    throw new Error(
      `"${folder.name}" has ${formatSize(knownSize)} of files; the limit is ${formatSize(MAX_FOLDER_SIZE)}. Choose a smaller folder.`,
    )
  }

  const entries: TreeEntry[] = []
  const failures: string[] = []
  let done = 0
  onProgress?.({ phase: 'downloading', done, total: pending.length })
  await forEachConcurrently(pending, CONCURRENCY, async (file) => {
    try {
      const data = file.exportPdf ? await exportDriveFileAsPdf(token, file.id) : await downloadDriveFile(token, file.id)
      entries.push(
        file.exportPdf
          ? { path: file.path, data, mimeType: 'application/pdf', filename: `${file.path.split('/').pop()}.pdf` }
          : { path: file.path, data, mimeType: file.mimeType },
      )
    } catch (e) {
      // Without a session there is no point in continuing: the user is asked to sign in again.
      if (e instanceof AuthError) throw e
      failures.push(`${file.path}: ${(e as Error).message}`)
    }
    onProgress?.({ phase: 'downloading', done: ++done, total: pending.length })
  })

  if (failures.length > 0) {
    const count = failures.length === 1 ? '1 file' : `${failures.length} files`
    throw new Error([`Could not download ${count}:`, ...failures].join('\n'))
  }
  return buildTree(folder.name, entries, emptyDirs)
}

/** Size in bytes from the file's metadata; null if Drive does not report it (native Google files). */
export async function getDriveFileSize(token: string, id: string): Promise<number | null> {
  const response = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=size&supportsAllDrives=true`,
  )
  const { size } = (await response.json()) as { size?: string }
  return size ? Number(size) : null
}

/** Downloads a file. With onBytes, reports the bytes received as they arrive. */
export async function downloadDriveFile(
  token: string,
  id: string,
  onBytes?: (received: number) => void,
): Promise<Uint8Array> {
  const response = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
  )
  if (!onBytes || !response.body) return new Uint8Array(await response.arrayBuffer())

  // Read in chunks to be able to count what was received.
  const chunks: Uint8Array[] = []
  let received = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onBytes(received)
  }
  const data = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.length
  }
  return data
}

/** Exports a native Google file to PDF (the API limits exports to 10 MB). */
export async function exportDriveFileAsPdf(token: string, id: string): Promise<Uint8Array> {
  const response = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=application%2Fpdf`,
  )
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Downloads a single file: native Google files are exported to PDF, as in folders.
 * With onBytes, reports the download progress (exported files have no size beforehand).
 */
export async function loadDriveFile(
  token: string,
  file: { id: string; name: string; mimeType: string },
  onBytes?: (received: number, total: number | undefined) => void,
): Promise<FileNode> {
  if (file.mimeType === FOLDER) throw new Error(`"${file.name}" is a folder.`)
  if (file.mimeType.startsWith('application/vnd.google-apps.')) {
    if (!EXPORTABLE.has(file.mimeType)) throw new Error(`"${file.name}" can't be exported to PDF.`)
    const data = await exportDriveFileAsPdf(token, file.id)
    return fileNode(file.name, data, 'application/pdf', `${file.name}.pdf`)
  }
  const total = (await getDriveFileSize(token, file.id)) ?? undefined
  const data = await downloadDriveFile(token, file.id, onBytes && ((received) => onBytes(received, total)))
  return fileNode(file.name, data, file.mimeType)
}
