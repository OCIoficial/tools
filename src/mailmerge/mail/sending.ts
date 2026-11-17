import { notifications } from '@mantine/notifications'
import { useMemo } from 'react'
import { buildAttachment } from '../attachments/resolve.ts'
import { AuthError, SendLimitError, UnconfirmedSendError, useGoogle } from '../google/index.ts'
import { ADDRESS_FIELDS, type ProblemField, type RenderedEmail } from '../merge/render.ts'
import {
  flushEmails,
  isSending,
  setSendState,
  setStatus,
  useStore,
  type SendMode,
  type SendStatus,
} from '../store.ts'
import { buildMessage, type MessageFields } from './mime.ts'

export const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)

/** Minimum pause between sends: the Gmail API quota allows about 2.5 emails per second. */
const MIN_INTERVAL = 400
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type SendMessage = (message: Uint8Array) => Promise<void>

let stopRequested = false

async function deliver(sendMessage: SendMessage, fields: MessageFields, email: RenderedEmail) {
  // The files are already in the tree: only sending needs the Google session.
  const message = buildMessage(fields, await Promise.all(email.attachments.map(buildAttachment)))
  await sendMessage(message)
}

/** Stops the sending in progress before the next email. */
export function stopSending() {
  stopRequested = true
}

/** Pending: neither sent nor unconfirmed (an unconfirmed one may have gone out; it is retried separately). */
const isPending = (status: SendStatus | undefined) => status?.state !== 'sent' && status?.state !== 'unconfirmed'

/**
 * Sends, one at a time and in Review order, the pending included emails, or with mode
 * "unconfirmed" only the unconfirmed ones. Keeps going after an error in one email.
 *
 * While it runs, the store does not allow changing the emails or which ones are sent (see
 * isSending): the list taken at the start is still the one Review shows.
 */
export async function sendAll(sendMessage: SendMessage, mode: SendMode, { minInterval = MIN_INTERVAL } = {}) {
  // If there is unprocessed text (just typed), the emails are regenerated before sending.
  flushEmails()
  const state = useStore.getState()
  // A load in progress would change the emails in the middle of sending; the UI does not get here.
  if (isSending(state) || state.loads > 0) return
  const { emails, statuses } = state
  const pending = emails.filter((email) =>
    mode === 'pending' ? isPending(statuses.get(email.index)) : statuses.get(email.index)?.state === 'unconfirmed',
  )
  if (pending.length === 0) return
  stopRequested = false
  // In the same task as the list: from here on the store is locked.
  setSendState({ stopReason: null, progress: { done: 0, total: pending.length } })

  for (const [i, email] of pending.entries()) {
    if (stopRequested) {
      setSendState({ stopReason: 'Sending was stopped.' })
      break
    }
    const started = Date.now()
    setStatus(email.index, { state: 'sending' })
    try {
      await deliver(sendMessage, { ...email, html: email.body }, email)
      setStatus(email.index, { state: 'sent', at: Date.now() })
    } catch (e) {
      const error = (e as Error).message
      if (e instanceof UnconfirmedSendError) {
        // If the connection dropped, the next ones would fail too: stop here.
        setStatus(email.index, { state: 'unconfirmed', error })
        setSendState({ stopReason: 'The connection was lost.' })
        break
      }
      setStatus(email.index, { state: 'failed', error })
      // Without a session or quota there is no point in continuing: the rest stays pending.
      if (e instanceof AuthError || e instanceof SendLimitError) {
        setSendState({ stopReason: error })
        break
      }
    }
    setSendState({ progress: { done: i + 1, total: pending.length } })
    await sleep(Math.max(0, minInterval - (Date.now() - started)))
  }
  setSendState({ progress: null })
}

/** Sends the first email to a test address: without Cc or Bcc, and with "[Test]" in the subject. */
async function sendTest(sendMessage: SendMessage, address: string) {
  flushEmails()
  const email = useStore.getState().emails[0]
  if (!email) return
  setSendState({ testing: true })
  try {
    const fields: MessageFields = {
      to: address,
      cc: '',
      bcc: '',
      replyTo: email.replyTo,
      subject: `[Test] ${email.subject}`,
      html: email.body,
    }
    await deliver(sendMessage, fields, email)
    notifications.show({ color: 'green', message: `Test email sent to ${address}.` })
  } catch (e) {
    const unconfirmed = e instanceof UnconfirmedSendError
    notifications.show({
      color: unconfirmed ? 'orange' : 'red',
      title: unconfirmed ? 'Test email not confirmed' : 'Test email not sent',
      message: (e as Error).message,
    })
  } finally {
    setSendState({ testing: false })
  }
}

/**
 * Warns before leaving the page while emails are being sent. It is set up once, outside React,
 * so it keeps working while another app is open (switching apps does not stop the sending).
 */
export function warnWhileSending() {
  const warn = (event: BeforeUnloadEvent) => event.preventDefault()
  let running = false
  useStore.subscribe((state) => {
    const next = state.progress !== null
    if (next === running) return
    running = next
    if (running) window.addEventListener('beforeunload', warn)
    else window.removeEventListener('beforeunload', warn)
  })
}

/**
 * Sending state and actions for the Send card, the phone's fixed bar and the confirmation
 * dialog. They re-render when the emails or the sending change, not while typing.
 */
export function useSendControls() {
  const google = useGoogle()
  const emails = useStore((state) => state.emails)
  const statuses = useStore((state) => state.statuses)
  const progress = useStore((state) => state.progress)
  const stopReason = useStore((state) => state.stopReason)
  const testAddress = useStore((state) => state.testAddress)
  const testing = useStore((state) => state.testing)
  const confirming = useStore((state) => state.confirming)
  const loading = useStore((state) => state.loads > 0)

  const summary = useMemo(() => {
    const sent = emails.filter((email) => statuses.get(email.index)?.state === 'sent')
    const failed = emails.filter((email) => statuses.get(email.index)?.state === 'failed')
    const pending = emails.filter((email) => isPending(statuses.get(email.index)))
    const unconfirmed = emails.filter((email) => statuses.get(email.index)?.state === 'unconfirmed')
    // The test ignores the row's recipients, so only render errors matter.
    const firstRenders = emails[0]?.problems.every((problem) =>
      (ADDRESS_FIELDS as ProblemField[]).includes(problem.field),
    )
    return {
      sent,
      failed,
      pending,
      unconfirmed,
      firstRenders: Boolean(firstRenders),
      // Only problems in the emails still to be sent block.
      blocking: pending.filter((email) => email.problems.length > 0).length,
      attachmentCount: pending.reduce((sum, email) => sum + email.attachments.length, 0),
    }
  }, [emails, statuses])

  const testTo = testAddress ?? google.email ?? ''
  const running = progress !== null
  const sendMessage = google.sendMessage

  return {
    ...summary,
    emails,
    progress,
    running,
    stopReason,
    signedIn: google.signedIn,
    account: google.email,
    testTo,
    setTestAddress: (testAddress: string) => setSendState({ testAddress }),
    testing,
    sendTest: () => sendTest(sendMessage, testTo),
    canTest: google.signedIn && testTo.includes('@') && summary.firstRenders && !running,
    confirming,
    setConfirming: (confirming: SendMode | false) => setSendState({ confirming }),
    confirmSend: () => {
      if (!confirming) return
      setSendState({ confirming: false })
      void sendAll(sendMessage, confirming)
    },
    stop: stopSending,
    loading,
    canSend: google.signedIn && summary.blocking === 0 && !loading,
    retryLabel: `Retry ${plural(summary.unconfirmed.length, 'unconfirmed email', 'unconfirmed emails')}`,
    sendLabel:
      summary.sent.length === 0
        ? `Send ${plural(summary.pending.length, 'email', 'emails')}`
        : `Send remaining ${summary.pending.length}`,
  }
}

export type SendControls = ReturnType<typeof useSendControls>
