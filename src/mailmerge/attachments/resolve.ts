import { zip } from 'fflate'
import { LruCache } from './cache.ts'
import { fileNode, filesIn, type AttachmentTree, type FileNode, type PathMatch } from './tree.ts'

/** Límite de Gmail para el total de adjuntos de un correo. */
export const MAX_ATTACHMENTS_SIZE = 25 * 1024 * 1024

/** Un archivo dentro del ZIP, con su ruta dentro del ZIP. */
export interface ZipEntry {
  path: string
  file: FileNode
}

/** Un adjunto por ruta: un archivo tal cual, o un ZIP con todo lo que calzó. */
export type ResolvedAttachment =
  | { kind: 'file'; filename: string; size: number; file: FileNode }
  /** size es la suma sin comprimir (cota superior). */
  | { kind: 'zip'; filename: string; size: number; entries: ZipEntry[] }

function zipOf(filename: string, entries: ZipEntry[]): ResolvedAttachment {
  return { kind: 'zip', filename, size: entries.reduce((sum, { file }) => sum + file.size, 0), entries }
}

const ARCHIVE_EXTENSION = /\.(zip|tar\.gz|tgz|tar|gz)$/i

/** Nombre de lo cargado, como ZIP: "documentos.zip" (archivo subido) o "Documentos.zip" (carpeta de Drive). */
export function treeZipName(tree: AttachmentTree): string {
  return `${tree.name.replace(ARCHIVE_EXTENSION, '')}.zip`
}

/**
 * Lo que calzó con una ruta, como un solo adjunto: un archivo tal cual, una carpeta como
 * "carpeta.zip", o varios en un ZIP que conserva la jerarquía desde la carpeta que comparten.
 */
export function attachmentFrom(tree: AttachmentTree, matches: PathMatch[]): ResolvedAttachment {
  if (matches.length === 1) {
    const { node } = matches[0]
    return node.kind === 'file'
      ? { kind: 'file', filename: node.filename, size: node.size, file: node }
      : zipOf(`${node.name}.zip`, filesIn(node))
  }

  // Cada archivo con su ruta desde la raíz; el último segmento es el nombre con que se adjunta.
  const files = matches.flatMap(({ node, path }) =>
    node.kind === 'file'
      ? [{ segments: [...path.slice(0, -1), node.filename], file: node }]
      : filesIn(node).map((entry) => ({ segments: [...path, ...entry.path.split('/')], file: entry.file })),
  )
  // Carpeta común: el prefijo de carpetas que comparten todos (sin el nombre del archivo).
  let common = files[0]?.segments.slice(0, -1) ?? []
  for (const { segments } of files) {
    let i = 0
    while (i < common.length && i < segments.length - 1 && common[i] === segments[i]) i++
    common = common.slice(0, i)
  }
  const entries = files.map(({ segments, file }) => ({ path: segments.slice(common.length).join('/'), file }))
  return zipOf(common.length > 0 ? `${common[common.length - 1]}.zip` : treeZipName(tree), entries)
}

const extensionOf = (filename: string) => /\.[^./]+$/.exec(filename)?.[0] ?? ''

/**
 * Nombre explícito del adjunto (ya con las variables reemplazadas). Sin extensión, se agrega la
 * que corresponde: la del archivo, o ".zip".
 */
export function withName(attachment: ResolvedAttachment, name: string): ResolvedAttachment {
  // Una barra en el nombre se leería como carpeta en algunos clientes de correo.
  const clean = name.trim().replace(/[\\/]/g, '-')
  if (!clean) return attachment
  const extension = attachment.kind === 'file' ? extensionOf(attachment.filename) : '.zip'
  return { ...attachment, filename: /\.[A-Za-z0-9]{1,8}$/.test(clean) ? clean : clean + extension }
}

function zipAsync(files: Record<string, Uint8Array>) {
  return new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 6 }, (error, data) => (error ? reject(error) : resolve(data))),
  )
}

export interface AttachmentContent {
  filename: string
  mimeType: string
  data: Uint8Array
}

/**
 * ZIPs ya comprimidos, por contenido (rutas y archivos). Un ZIP que se repite en todos los correos
 * se comprime una vez; los que son de un solo correo van saliendo del caché.
 */
const zipCache = new LruCache<string, Uint8Array>(64 * 1024 * 1024, (data) => data.length)

async function zipEntries(entries: ZipEntry[]): Promise<Uint8Array> {
  const key = entries.map(({ path, file }) => `${file.id}\u0000${path}`).join('\u0001')
  const cached = zipCache.get(key)
  if (cached) return cached
  const data = await zipAsync(Object.fromEntries(entries.map(({ path, file }) => [path, file.data])))
  zipCache.set(key, data)
  return data
}

/** Arma el adjunto con el contenido ya cargado en el árbol; un ZIP se comprime aquí. */
export async function buildAttachment(attachment: ResolvedAttachment): Promise<AttachmentContent> {
  if (attachment.kind === 'file') {
    return { filename: attachment.filename, mimeType: attachment.file.mimeType, data: attachment.file.data }
  }
  return { filename: attachment.filename, mimeType: 'application/zip', data: await zipEntries(attachment.entries) }
}

/** Todo un árbol como un solo archivo ZIP (una carpeta de Drive adjunta a todos los correos). */
export async function zipTree(tree: AttachmentTree): Promise<FileNode> {
  const entries = filesIn(tree.root)
  if (entries.length === 0) throw new Error(`"${tree.name}" has no files.`)
  const files = Object.fromEntries(entries.map(({ path, file }) => [path, file.data]))
  return fileNode(treeZipName(tree), await zipAsync(files), 'application/zip')
}
