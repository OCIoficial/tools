import { zip } from 'fflate'
import { LruCache } from './cache.ts'
import { fileNode, filesIn, type AttachmentTree, type FileNode, type PathMatch } from './tree.ts'

/** Gmail's limit for the total size of an email's attachments. */
export const MAX_ATTACHMENTS_SIZE = 25 * 1024 * 1024

/** A file inside the ZIP, with its path inside the ZIP. */
export interface ZipEntry {
  path: string
  file: FileNode
}

/** One attachment per path: a file as is, or a ZIP with everything that matched. */
export type ResolvedAttachment =
  | { kind: 'file'; filename: string; size: number; file: FileNode }
  /** size is the uncompressed sum (upper bound). */
  | { kind: 'zip'; filename: string; size: number; entries: ZipEntry[] }

function zipOf(filename: string, entries: ZipEntry[]): ResolvedAttachment {
  return { kind: 'zip', filename, size: entries.reduce((sum, { file }) => sum + file.size, 0), entries }
}

const ARCHIVE_EXTENSION = /\.(zip|tar\.gz|tgz|tar|gz)$/i

/** Name of what was loaded, as a ZIP: "documents.zip" (uploaded file) or "Documents.zip" (Drive folder). */
export function treeZipName(tree: AttachmentTree): string {
  return `${tree.name.replace(ARCHIVE_EXTENSION, '')}.zip`
}

/**
 * What matched a path, as a single attachment: a file as is, a folder as "folder.zip",
 * or several in a ZIP that keeps the hierarchy from the folder they share.
 */
export function attachmentFrom(tree: AttachmentTree, matches: PathMatch[]): ResolvedAttachment {
  if (matches.length === 1) {
    const { node } = matches[0]
    return node.kind === 'file'
      ? { kind: 'file', filename: node.filename, size: node.size, file: node }
      : zipOf(`${node.name}.zip`, filesIn(node))
  }

  // Each file with its path from the root; the last segment is the name it is attached with.
  const files = matches.flatMap(({ node, path }) =>
    node.kind === 'file'
      ? [{ segments: [...path.slice(0, -1), node.filename], file: node }]
      : filesIn(node).map((entry) => ({ segments: [...path, ...entry.path.split('/')], file: entry.file })),
  )
  // Common folder: the prefix of folders they all share (without the file name).
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
 * Explicit attachment name (with the variables already replaced). Without an extension, the
 * right one is added: the file's, or ".zip".
 */
export function withName(attachment: ResolvedAttachment, name: string): ResolvedAttachment {
  // A slash in the name would be read as a folder by some email clients.
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
 * Already compressed ZIPs, by content (paths and files). A ZIP that repeats in every email
 * is compressed once; the ones for a single email get evicted from the cache.
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

/** Builds the attachment with the contents already loaded in the tree; a ZIP is compressed here. */
export async function buildAttachment(attachment: ResolvedAttachment): Promise<AttachmentContent> {
  if (attachment.kind === 'file') {
    return { filename: attachment.filename, mimeType: attachment.file.mimeType, data: attachment.file.data }
  }
  return { filename: attachment.filename, mimeType: 'application/zip', data: await zipEntries(attachment.entries) }
}

/** A whole tree as a single ZIP file (a Drive folder attached to every email). */
export async function zipTree(tree: AttachmentTree): Promise<FileNode> {
  const entries = filesIn(tree.root)
  if (entries.length === 0) throw new Error(`"${tree.name}" has no files.`)
  const files = Object.fromEntries(entries.map(({ path, file }) => [path, file.data]))
  return fileNode(treeZipName(tree), await zipAsync(files), 'application/zip')
}
