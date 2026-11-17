/**
 * File with its contents already downloaded: the whole tree is downloaded when it is loaded, so
 * errors show up before sending and nothing is downloaded while sending.
 */
export interface FileNode {
  kind: 'file'
  id: string
  /** Name in the tree; it is the one attachment paths use. */
  name: string
  /** Name it is attached with (an exported Google Doc gets ".pdf"). */
  filename: string
  mimeType: string
  size: number
  data: Uint8Array
}

export interface DirNode {
  kind: 'dir'
  id: string
  name: string
  /** Drive allows repeated names in a folder, so this is not a map. */
  children: TreeNode[]
}

export type TreeNode = FileNode | DirNode

export interface AttachmentTree {
  name: string
  root: DirNode
  fileCount: number
  totalSize: number
}

export interface TreeEntry {
  /** Path relative to the root, separated by "/". */
  path: string
  data: Uint8Array
  /** If missing, inferred from the extension. */
  mimeType?: string
  /** If missing, the file name in the path. */
  filename?: string
}

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  html: 'text/html',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export const mimeTypeFromName = (name: string) =>
  MIME_TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'

let nextId = 0
const newId = () => `n${nextId++}`

/** A single file (or one inside a tree). Without a mimeType, it is inferred from the extension. */
export function fileNode(name: string, data: Uint8Array, mimeType?: string, filename = name): FileNode {
  return {
    kind: 'file',
    id: newId(),
    name,
    filename,
    mimeType: mimeType || mimeTypeFromName(filename),
    size: data.length,
    data,
  }
}

/** Builds the tree from a flat list of files; folders are created from the paths. */
export function buildTree(name: string, entries: TreeEntry[], emptyDirs: string[] = []): AttachmentTree {
  const root: DirNode = { kind: 'dir', id: newId(), name, children: [] }

  function dirAt(segments: string[]): DirNode {
    let dir = root
    for (const segment of segments) {
      let child = dir.children.find((c): c is DirNode => c.kind === 'dir' && c.name === segment)
      if (!child) {
        child = { kind: 'dir', id: newId(), name: segment, children: [] }
        dir.children.push(child)
      }
      dir = child
    }
    return dir
  }

  for (const path of emptyDirs) dirAt(splitPath(path))
  let totalSize = 0
  for (const entry of entries) {
    const segments = splitPath(entry.path)
    const fileName = segments.pop()
    if (!fileName) continue
    dirAt(segments).children.push(fileNode(fileName, entry.data, entry.mimeType, entry.filename ?? fileName))
    totalSize += entry.data.length
  }

  sortTree(root)
  return { name, root, fileCount: entries.length, totalSize }
}

function sortTree(dir: DirNode) {
  dir.children.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
  for (const child of dir.children) if (child.kind === 'dir') sortTree(child)
}

export function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '' && segment !== '.')
}

export function hasGlob(path: string): boolean {
  return /[*?]/.test(path)
}

/** Turns a segment with wildcards (`*`, `?`) into an exact regular expression. */
function segmentPattern(segment: string): RegExp {
  const source = segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
  return new RegExp(`^${source}$`)
}

/**
 * Looks up the path in the tree. Exact comparison; `*` and `?` within a name,
 * `**` for any number of folders. Returns every node that matches.
 */
/** What matched a path, with its location (names from the root, including its own). */
export interface PathMatch {
  node: TreeNode
  path: string[]
}

export function findPath(tree: AttachmentTree, path: string): PathMatch[] {
  const segments = splitPath(path)
  if (segments.length === 0) return []

  const results = new Map<TreeNode, string[]>()
  function walk(node: DirNode, index: number, at: string[]) {
    const segment = segments[index]
    const last = index === segments.length - 1
    if (segment === '**') {
      if (last) {
        // "a/**" matches everything inside a.
        for (const child of node.children) results.set(child, [...at, child.name])
        return
      }
      walk(node, index + 1, at)
      for (const child of node.children) if (child.kind === 'dir') walk(child, index, [...at, child.name])
      return
    }
    const pattern = segmentPattern(segment)
    for (const child of node.children) {
      if (!pattern.test(child.name)) continue
      if (last) results.set(child, [...at, child.name])
      else if (child.kind === 'dir') walk(child, index + 1, [...at, child.name])
    }
  }
  walk(tree.root, 0, [])
  return [...results].map(([node, path]) => ({ node, path }))
}

/** Files inside a folder, with their path relative to it. */
export function filesIn(dir: DirNode, prefix = ''): { path: string; file: FileNode }[] {
  return dir.children.flatMap((child) =>
    child.kind === 'file'
      ? [{ path: prefix + child.filename, file: child }]
      : filesIn(child, `${prefix}${child.name}/`),
  )
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
