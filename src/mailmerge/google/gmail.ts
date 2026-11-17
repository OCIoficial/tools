import { AuthError } from './api.ts'

/** Gmail API limit for a message sent through the upload endpoint. */
export const MAX_MESSAGE_SIZE = 35 * 1024 * 1024

/** An error that prevents further sending (Gmail's daily limit). */
export class SendLimitError extends Error {}

/**
 * No response arrived (the connection dropped): Gmail may have sent the message. It is not
 * retried automatically, so as not to send an email twice.
 */
export class UnconfirmedSendError extends Error {}

/** Endpoint with the message in JSON. The upload one (/upload/...) does not include the CORS header
 * in its response: the browser blocks it even though Gmail sent the email. */
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

/** Base64url without padding, as the raw field of the Gmail API requires. */
function base64Url(bytes: Uint8Array): string {
  let binary = ''
  // In chunks, so as not to exceed the maximum number of arguments of String.fromCharCode.
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
 * Sends an already built message (RFC 5322). Retries up to 3 times on rate limits
 * and server errors, waiting 1, 2 and 4 seconds.
 */
export async function sendRawMessage(token: string, message: Uint8Array): Promise<string> {
  if (message.length > MAX_MESSAGE_SIZE) {
    throw new Error(`The message is ${(message.length / 1024 / 1024).toFixed(1)} MB; Gmail allows up to 35 MB.`)
  }

  const payload = JSON.stringify({ raw: base64Url(message) })
  for (let attempt = 0; ; attempt++) {
    // No connection before sending: it certainly did not go out.
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
    // Sent: even if the response cannot be read, Gmail already accepted it.
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
