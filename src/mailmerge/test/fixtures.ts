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

/** Qué adjunta la ruta de una fila. */
export type RowAttachment =
  /** Su propio archivo, "rows/r<i>.txt". */
  | 'own'
  /** Su carpeta "folders/f<i>" como ZIP. */
  | 'folder'
  /** Lo que calce con "folders/f<i>/*", también como ZIP. */
  | 'glob'
  /** Una ruta que no existe (opcional: el correo sale sin ese adjunto). */
  | 'missing'

export interface RowSpec {
  name: string
  subject: string
  /** Texto del cuerpo. */
  note: string
  attachment: RowAttachment
  /** Nombre explícito del adjunto; vacío = automático. */
  attachmentName: string
  /** Agrega un Cc. */
  cc: boolean
}

/** Dirección única por fila: identifica a qué fila corresponde cada mensaje enviado. */
export const addressFor = (row: number) => `r${row}@test.example`

/** Archivo común a todos los correos. */
export const SHARED_BYTES = new TextEncoder().encode('%PDF-1.4 shared file for every email')

const bytes = (text: string) => new TextEncoder().encode(text)

/**
 * Árbol con un archivo y una carpeta por fila. Las carpetas tienen las mismas rutas y difieren
 * solo en el contenido de un archivo, así un ZIP que saliera del caché de otra fila se notaría.
 */
export function rowsTree(count: number): AttachmentTree {
  const entries: TreeEntry[] = []
  for (let i = 0; i < count; i++) {
    entries.push({ path: `rows/r${i}.txt`, data: bytes(`own file of row ${i}`) })
    entries.push({ path: `folders/f${i}/same.txt`, data: bytes('identical in every folder') })
    // Misma ruta en todas las carpetas, distinto contenido.
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
 * Deja el store como si el usuario hubiera cargado esta planilla, escrito el template y
 * agregado los adjuntos, con las filas `excluded` sin incluir. Reinicia el estado de envío.
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

/** Un mensaje tal como lo ve quien lo recibe: decodificado por un parser independiente. */
export interface Received {
  raw: Uint8Array
  parsed: Email
}

export async function parseMessage(raw: Uint8Array): Promise<Received> {
  return { raw, parsed: await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer' }) }
}

/** Fila a la que va un mensaje, por su dirección única. */
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

/** "Nombre <a@b>" → { name, address }, como lo arma el remitente. */
function expectedMailboxes(value: string): { name: string; address: string }[] {
  return splitAddresses(value).map((entry) => {
    const match = entry.match(/^(.*?)\s*<([^>]+)>\s*$/)
    return match
      ? { name: match[1].replace(/^"|"$/g, '').trim(), address: match[2] }
      : { name: '', address: entry }
  })
}

/** Lo que debe recibir el destinatario de un correo de Review, en la forma que entrega el parser. */
export interface ExpectedMessage {
  to: { name: string; address: string }[]
  cc: { name: string; address: string }[]
  subject: string
  html: string
  attachments: { filename: string; mimeType: string; files: Record<string, string> | string }[]
}

const hex = (data: Uint8Array) => Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('')

/** Un adjunto descrito por su contenido: los bytes, o para un ZIP, cada ruta con sus bytes. */
function describeContent(mimeType: string, data: Uint8Array): Record<string, string> | string {
  if (mimeType !== 'application/zip') return hex(data)
  return Object.fromEntries(Object.entries(unzipSync(data)).map(([path, content]) => [path, hex(content)]))
}

/** Lo que muestra Review para un adjunto: el archivo, o las rutas que lista el chip del ZIP. */
function describeResolved(attachment: ResolvedAttachment): ExpectedMessage['attachments'][number] {
  return attachment.kind === 'file'
    ? { filename: attachment.filename, mimeType: attachment.file.mimeType, files: hex(attachment.file.data) }
    : {
        filename: attachment.filename,
        mimeType: 'application/zip',
        files: Object.fromEntries(attachment.entries.map(({ path, file }) => [path, hex(file.data)])),
      }
}

/** Lo que debe recibir el destinatario, a partir del correo tal como está en Review. */
export function expectedMessage(email: RenderedEmail): ExpectedMessage {
  return {
    to: expectedMailboxes(email.to),
    cc: expectedMailboxes(email.cc),
    subject: email.subject,
    html: email.body,
    attachments: email.attachments.map(describeResolved),
  }
}

/** El HTML enviado va dentro de un documento completo; se compara solo el cuerpo. */
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
