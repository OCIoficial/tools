import { AuthError } from './api.ts'

/** Límite de la Gmail API para un mensaje enviado por el endpoint de subida. */
export const MAX_MESSAGE_SIZE = 35 * 1024 * 1024

/** Un error que impide seguir enviando (límite diario de Gmail). */
export class SendLimitError extends Error {}

/**
 * No llegó respuesta (se cortó la conexión): Gmail pudo haber enviado el mensaje. No se
 * reintenta solo, para no mandar un correo dos veces.
 */
export class UnconfirmedSendError extends Error {}

/** Endpoint con el mensaje en JSON. El de subida (/upload/...) no incluye la cabecera CORS en su
 * respuesta: el navegador la bloquea aunque Gmail haya enviado el correo. */
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

/** Base64url sin relleno, como pide el campo raw de la Gmail API. */
function base64Url(bytes: Uint8Array): string {
  let binary = ''
  // En bloques, para no exceder el máximo de argumentos de String.fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface GmailError {
  error?: { message?: string; errors?: { reason?: string }[] }
}

/**
 * Envía un mensaje ya armado (RFC 5322). Reintenta hasta 3 veces ante límites de frecuencia
 * y errores del servidor, esperando 1, 2 y 4 segundos.
 */
export async function sendRawMessage(token: string, message: Uint8Array): Promise<string> {
  if (message.length > MAX_MESSAGE_SIZE) {
    throw new Error(`The message is ${(message.length / 1024 / 1024).toFixed(1)} MB; Gmail allows up to 35 MB.`)
  }

  const payload = JSON.stringify({ raw: base64Url(message) })
  for (let attempt = 0; ; attempt++) {
    // Sin conexión antes de enviar: seguro que no salió.
    if (navigator.onLine === false) throw new Error("You're offline. The email wasn't sent.")
    let response: Response
    try {
      response = await fetch(SEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: payload,
      })
    } catch {
      throw new UnconfirmedSendError(
        'The connection was lost while sending, so Gmail never confirmed it. It may have been sent: check your Sent folder in Gmail.',
      )
    }
    // Enviado: aunque la respuesta no se pueda leer, Gmail ya lo aceptó.
    if (response.ok) return ((await response.json().catch(() => ({}))) as { id?: string }).id ?? ''
    if (response.status === 401) throw new AuthError('Your Google session expired. Sign in again.')

    const body = (await response.json().catch(() => ({}))) as GmailError
    const reason = body.error?.errors?.[0]?.reason ?? ''
    const message_ = body.error?.message ?? `Gmail error ${response.status}`
    if (reason === 'dailyLimitExceeded' || /daily.*limit/i.test(message_)) {
      throw new SendLimitError(`Gmail's daily sending limit was reached. Try again tomorrow. (${message_})`)
    }
    const retryable =
      response.status === 429 ||
      response.status >= 500 ||
      reason === 'rateLimitExceeded' ||
      reason === 'userRateLimitExceeded'
    if (!retryable || attempt >= 3) throw new Error(message_)
    await sleep(1000 * 2 ** attempt)
  }
}
