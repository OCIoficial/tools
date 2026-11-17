import { buildTree, fileNode, formatSize, type AttachmentTree, type FileNode, type TreeEntry } from '../attachments/tree.ts'
import { AuthError } from './api.ts'

const FOLDER = 'application/vnd.google-apps.folder'
const SHORTCUT = 'application/vnd.google-apps.shortcut'
/** Archivos nativos de Google que se adjuntan exportados a PDF. */
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

/** Tope para el total de una carpeta: protege de elegir por error una carpeta enorme. */
const MAX_FOLDER_SIZE = 200 * 1024 * 1024

/** Pedidos en paralelo a Drive (listar carpetas o descargar archivos), para no exceder las cuotas de la API. */
const CONCURRENCY = 5

/** Ejecuta fn sobre cada elemento, con a lo más `limit` en paralelo. */
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
  /** Archivo nativo de Google (Docs, Sheets, Slides) que se exporta a PDF. */
  exportPdf: boolean
  size: number
}

export type DriveTreeProgress =
  | { phase: 'listing'; files: number }
  | { phase: 'downloading'; done: number; total: number }

/**
 * Lee la carpeta completa y descarga todos sus archivos, para que los errores aparezcan al
 * cargarla y no a mitad de un envío. Los atajos se siguen; los archivos nativos de Google
 * que no se pueden exportar a PDF se omiten. Si algún archivo falla, se informan todos juntos.
 */
export async function loadDriveTree(
  token: string,
  folder: { id: string; name: string },
  onProgress?: (progress: DriveTreeProgress) => void,
): Promise<AttachmentTree> {
  const pending: PendingFile[] = []
  const emptyDirs: string[] = []
  // Evita ciclos con atajos a carpetas que contienen al atajo.
  const visited = new Set<string>([folder.id])
  // Un nivel del árbol a la vez: las subcarpetas encontradas forman el nivel siguiente.
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

  // Los exportados no tienen tamaño hasta exportarlos; el tope cuenta solo los conocidos.
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
      // Sin sesión no tiene sentido seguir: se pide iniciar sesión de nuevo.
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

/** Tamaño en bytes según los datos del archivo; null si Drive no lo informa (archivos nativos de Google). */
export async function getDriveFileSize(token: string, id: string): Promise<number | null> {
  const response = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=size&supportsAllDrives=true`,
  )
  const { size } = (await response.json()) as { size?: string }
  return size ? Number(size) : null
}

/** Descarga un archivo. Con onBytes, informa los bytes recibidos a medida que llegan. */
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

  // Se lee por partes para poder contar lo recibido.
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

/** Exporta un archivo nativo de Google a PDF (la API limita la exportación a 10 MB). */
export async function exportDriveFileAsPdf(token: string, id: string): Promise<Uint8Array> {
  const response = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=application%2Fpdf`,
  )
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Descarga un archivo suelto: los nativos de Google se exportan a PDF, como en las carpetas.
 * Con onBytes, informa el avance de la descarga (los exportados no tienen tamaño previo).
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
