import { LruCache } from '../attachments/cache.ts'
import type { AttachmentContent } from '../attachments/resolve.ts'
import { splitAddresses } from '../merge/render.ts'

const CRLF = '\r\n'
const encoder = new TextEncoder()

/** Base64 en líneas de 76 caracteres, como exige MIME. */
export function base64Lines(bytes: Uint8Array): string {
  let binary = ''
  // En bloques, para no exceder el máximo de argumentos de String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return (btoa(binary).match(/.{1,76}/g) ?? []).join(CRLF)
}

/**
 * Base64 de los adjuntos, por contenido: un adjunto común a todos los correos se codifica una
 * vez, no una por destinatario.
 */
const base64Cache = new LruCache<Uint8Array, string>(96 * 1024 * 1024, (text) => text.length)

function attachmentBase64(data: Uint8Array): string {
  let encoded = base64Cache.get(data)
  if (encoded === undefined) {
    encoded = base64Lines(data)
    base64Cache.set(data, encoded)
  }
  return encoded
}

const isAscii = (text: string) => /^[\x20-\x7e]*$/.test(text)

/**
 * Codifica un texto con caracteres no ASCII como "encoded words" (RFC 2047), en trozos de
 * hasta 45 bytes sin cortar caracteres, separados por un pliegue de línea.
 */
export function encodeHeaderText(text: string, separator = `${CRLF} `): string {
  if (isAscii(text)) return text
  const words: string[] = []
  let chunk = ''
  for (const char of text) {
    if (encoder.encode(chunk + char).length > 45) {
      words.push(chunk)
      chunk = ''
    }
    chunk += char
  }
  if (chunk) words.push(chunk)
  return words.map((word) => `=?UTF-8?B?${base64Lines(encoder.encode(word))}?=`).join(separator)
}

/** "José <a@x.cl>, b@y.cl" → nombres codificados y direcciones separadas por coma. */
export function encodeAddressList(value: string): string {
  return splitAddresses(value)
    .map((entry) => {
      const match = entry.match(/^(.*?)\s*<([^>]+)>\s*$/)
      if (!match) return entry
      const name = match[1].replace(/^"|"$/g, '').trim()
      if (!name) return `<${match[2]}>`
      const encoded = isAscii(name) ? `"${name.replace(/["\\]/g, '\\$&')}"` : encodeHeaderText(name)
      return `${encoded} <${match[2]}>`
    })
    .join(', ')
}

/** Texto plano a partir del HTML, para la parte alternativa del mensaje. */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html')
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  doc.querySelectorAll('p, div, h1, h2, h3, h4, li, blockquote, tr').forEach((block) => block.append('\n\n'))
  doc.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href')
    if (href && href !== link.textContent) link.append(` (${href})`)
  })
  return (doc.body.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function quoteParam(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

export interface MessageFields {
  to: string
  cc: string
  bcc: string
  replyTo: string
  subject: string
  html: string
}

/**
 * Arma el mensaje completo (RFC 5322 / MIME). Sin "From": Gmail lo agrega con el nombre de la cuenta.
 * Gmail envía también a los destinatarios de Bcc y quita ese encabezado antes de entregar.
 */
export function buildMessage(fields: MessageFields, attachments: AttachmentContent[]): Uint8Array {
  const random = () => crypto.randomUUID().replace(/-/g, '')
  const mixed = `mixed_${random()}`
  const alternative = `alt_${random()}`

  const headers = [
    `To: ${encodeAddressList(fields.to)}`,
    fields.cc && `Cc: ${encodeAddressList(fields.cc)}`,
    fields.bcc && `Bcc: ${encodeAddressList(fields.bcc)}`,
    fields.replyTo && `Reply-To: ${encodeAddressList(fields.replyTo)}`,
    `Subject: ${encodeHeaderText(fields.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
  ].filter(Boolean)

  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${fields.html}</body></html>`
  const parts = [
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    '',
    `--${alternative}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(encoder.encode(htmlToText(fields.html))),
    `--${alternative}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(encoder.encode(html)),
    `--${alternative}--`,
  ]

  for (const attachment of attachments) {
    // Nombre en dos formas: encoded word (clientes antiguos) y RFC 2231 (filename*).
    // Como Gmail, el encoded word va entre comillas.
    const name = quoteParam(isAscii(attachment.filename) ? attachment.filename : encodeHeaderText(attachment.filename, ' '))
    const extended = `UTF-8''${encodeURIComponent(attachment.filename)}`
    parts.push(
      `--${mixed}`,
      `Content-Type: ${attachment.mimeType};${CRLF} name=${name}`,
      `Content-Disposition: attachment;${CRLF} filename=${name};${CRLF} filename*=${extended}`,
      'Content-Transfer-Encoding: base64',
      '',
      attachmentBase64(attachment.data),
    )
  }
  parts.push(`--${mixed}--`, '')

  return encoder.encode(headers.join(CRLF) + CRLF + CRLF + parts.join(CRLF))
}
