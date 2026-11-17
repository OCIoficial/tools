import { LruCache } from '../attachments/cache.ts'
import type { AttachmentContent } from '../attachments/resolve.ts'
import { splitAddresses } from '../merge/render.ts'

const CRLF = '\r\n'
const encoder = new TextEncoder()

/** Base64 in 76-character lines, as MIME requires. */
export function base64Lines(bytes: Uint8Array): string {
  let binary = ''
  // In chunks, so as not to exceed the maximum number of arguments of String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return (btoa(binary).match(/.{1,76}/g) ?? []).join(CRLF)
}

/**
 * Base64 of the attachments, by content: an attachment shared by every email is encoded once,
 * not once per recipient.
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
 * Encodes text with non-ASCII characters as "encoded words" (RFC 2047), in chunks of
 * up to 45 bytes without splitting characters, separated by a line fold.
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

/** "José <a@x.cl>, b@y.cl" → encoded names and comma-separated addresses. */
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

/** Plain text from the HTML, for the alternative part of the message. */
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
 * Builds the complete message (RFC 5322 / MIME). No "From": Gmail adds it with the account name.
 * Gmail also sends to the Bcc recipients and removes that header before delivering.
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
    // Name in two forms: encoded word (old clients) and RFC 2231 (filename*).
    // Like Gmail, the encoded word goes in quotes.
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
