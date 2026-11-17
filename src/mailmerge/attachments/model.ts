import type { Origin } from '../sources.ts'
import type { AttachmentTree, FileNode } from './tree.ts'

/** A file that goes in every email. */
export interface SharedAttachment {
  id: string
  origin: Origin
  file: FileNode
  /** Attachment name, with variables; empty = the file's name. */
  name: string
}

/** One path = one attachment, relative to its source's tree. */
export interface AttachmentPath {
  /** With wildcards, whatever matches goes in a single ZIP. */
  path: string
  /** Attachment name, with variables; empty = automatic. */
  name: string
  /** If required, not finding it is a problem; if not, the email goes out without that attachment. */
  required: boolean
}

/** A folder or archive with its paths: each row's attachments come from here. */
export interface PathSource {
  id: string
  origin: Origin
  tree: AttachmentTree
  paths: AttachmentPath[]
}

export const newAttachmentId = () => crypto.randomUUID()
