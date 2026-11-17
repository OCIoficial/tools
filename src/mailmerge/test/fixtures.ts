import { unzipSync } from 'fflate'
import PostalMime, { type Address, type Email } from 'postal-mime'
import { newAttachmentId } from '../attachments/model.ts'
import type { ResolvedAttachment } from '../attachments/resolve.ts'
import { buildTree, fileNode, type AttachmentTree, type TreeEntry } from '../attachments/tree.ts'
import { toDataset } from '../merge/dataset.ts'
import { splitAddresses, type RenderedEmail } from '../merge/render.ts'
import { EMPTY_TEMPLATE } from '../merge/template.ts'
import {
  flushEmails,
  setDataset,
  setExcluded,
  updateShared,
  updateSources,
  updateTemplate,
  useStore,
} from '../store.ts'

/** What a row's path attaches. */
export type RowAttachment =
  /** Its own file, "rows/r<i>.txt". */
  | 'own'
  /** Its folder "folders/f<i>" as a ZIP. */
  | 'folder'
  /** Whatever matches "folders/f<i>/*", also as a ZIP. */
  | 'glob'
  /** A path that does not exist (optional: the email goes out without that attachment). */
  | 'missing'

export interface RowSpec {
  name: string
  subject: string
  /** Body text. */
  note: string
  attachment: RowAttachment
  /** Explicit attachment name; empty = automatic. */
  attachmentName: string
  /** Adds a Cc. */
  cc: boolean
}

/** Unique address per row: identifies which row each sent message belongs to. */
export const addressFor = (row: number) => `r${row}@test.example`

/** File shared by every email. */
export const SHARED_BYTES = new TextEncoder().encode('%PDF-1.4 shared file for every email')

const bytes = (text: string) => new TextEncoder().encode(text)

/**
 * Tree with one file and one folder per row. The folders have the same paths and differ
 * only in the contents of one file, so a ZIP coming from another row's cache would show.
 */
export function rowsTree(count: number): AttachmentTree {
  const entries: TreeEntry[] = []
  for (let i = 0; i < count; i++) {
    entries.push({ path: `rows/r${i}.txt`, data: bytes(`own file of row ${i}`) })
    entries.push({ path: `folders/f${i}/same.txt`, data: bytes('identical in every folder') })
    // Same path in every folder, different contents.
    entries.push({ path: `folders/f${i}/sub/differs.txt`, data: bytes(`content of folder ${i}`) })
  }
  return buildTree('files', entries)
}

function pathFor(row: number, attachment: RowAttachment): string {
  switch (attachment) {
    case 'own':
      return `rows/r${row}.txt`
    case 'folder':
      return `folders/f${row}`
    case 'glob':
      return `folders/f${row}/*`
    case 'missing':
      return `rows/missing-${row}.txt`
  }
}

/**
 * Leaves the store as if the user had loaded this spreadsheet, written the template and
 * added the attachments, with the `excluded` rows not included. Resets the sending state.
 */
export function loadScenario(rows: RowSpec[], excluded: Iterable<number> = []): void {
  useStore.setState({ progress: null, loads: 0, stopReason: null, confirming: false })
  updateTemplate({
    ...EMPTY_TEMPLATE,
    to: '{{ name }} <{{ email }}>',
    cc: '{{ cc }}',
    subject: '{{ subject }}',
    format: 'markdown',
    markdown: 'Hello **{{ name }}**,\n\n{{ note }}',
  })
  updateShared(() => [
    { id: newAttachmentId(), origin: { kind: 'upload' }, file: fileNode('shared.pdf', SHARED_BYTES), name: '' },
  ])
  updateSources(() => [
    {
      id: newAttachmentId(),
      origin: { kind: 'upload' },
      tree: rowsTree(rows.length),
      paths: [{ path: '{{ path }}', name: '{{ attachment_name }}', required: false }],
    },
  ])
  const header = ['name', 'email', 'cc', 'subject', 'note', 'path', 'attachment_name']
  const values = rows.map((row, i) => [
    row.name,
    addressFor(i),
    row.cc ? `cc${i}@test.example` : '',
    row.subject,
    row.note,
    pathFor(i, row.attachment),
    row.attachmentName,
  ])
  setDataset(toDataset([header, ...values], true))
  setExcluded(new Set(excluded))
  flushEmails()
}

/** A message as its recipient sees it: decoded by an independent parser. */
export interface Received {
  raw: Uint8Array
  parsed: Email
}

export async function parseMessage(raw: Uint8Array): Promise<Received> {
  return { raw, parsed: await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer' }) }
}

/** Row a message goes to, by its unique address. */
export function rowOf({ parsed }: Received): number {
  const address = mailboxes(parsed.to)[0]?.address ?? ''
  const match = /^r(\d+)@test\.example$/.exec(address)
  if (!match) throw new Error(`Unexpected recipient "${address}"`)
  return Number(match[1])
}

function mailboxes(addresses: Address[] | undefined): { name: string; address: string }[] {
  return (addresses ?? []).flatMap((entry) =>
    entry.address === undefined ? mailboxes((entry as { group?: Address[] }).group) : [entry],
  )
}

/** "Name <a@b>" → { name, address }, as the sender builds it. */
function expectedMailboxes(value: string): { name: string; address: string }[] {
  return splitAddresses(value).map((entry) => {
    const match = entry.match(/^(.*?)\s*<([^>]+)>\s*$/)
    return match
      ? { name: match[1].replace(/^"|"$/g, '').trim(), address: match[2] }
      : { name: '', address: entry }
  })
}

/** What the recipient of a Review email should receive, in the form the parser returns. */
export interface ExpectedMessage {
  to: { name: string; address: string }[]
  cc: { name: string; address: string }[]
  subject: string
  html: string
  attachments: { filename: string; mimeType: string; files: Record<string, string> | string }[]
}

const hex = (data: Uint8Array) => Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('')

/** An attachment described by its contents: the bytes, or for a ZIP, each path with its bytes. */
function describeContent(mimeType: string, data: Uint8Array): Record<string, string> | string {
  if (mimeType !== 'application/zip') return hex(data)
  return Object.fromEntries(Object.entries(unzipSync(data)).map(([path, content]) => [path, hex(content)]))
}

/** What Review shows for an attachment: the file, or the paths listed by the ZIP chip. */
function describeResolved(attachment: ResolvedAttachment): ExpectedMessage['attachments'][number] {
  return attachment.kind === 'file'
    ? { filename: attachment.filename, mimeType: attachment.file.mimeType, files: hex(attachment.file.data) }
    : {
        filename: attachment.filename,
        mimeType: 'application/zip',
        files: Object.fromEntries(attachment.entries.map(({ path, file }) => [path, hex(file.data)])),
      }
}

/** What the recipient should receive, based on the email as it is in Review. */
export function expectedMessage(email: RenderedEmail): ExpectedMessage {
  return {
    to: expectedMailboxes(email.to),
    cc: expectedMailboxes(email.cc),
    subject: email.subject,
    html: email.body,
    attachments: email.attachments.map(describeResolved),
  }
}

/** The sent HTML goes inside a complete document; only the body is compared. */
const BODY = /^<!doctype html><html><head><meta charset="utf-8"><\/head><body>([\s\S]*)<\/body><\/html>$/

export function describeReceived({ parsed }: Received): ExpectedMessage {
  const html = parsed.html ?? ''
  return {
    to: mailboxes(parsed.to),
    cc: mailboxes(parsed.cc),
    subject: parsed.subject ?? '',
    html: BODY.exec(html)?.[1] ?? `(not wrapped as expected) ${html}`,
    attachments: parsed.attachments.map((attachment) => ({
      filename: attachment.filename ?? '',
      mimeType: attachment.mimeType,
      files: describeContent(attachment.mimeType, new Uint8Array(attachment.content as ArrayBuffer)),
    })),
  }
}
