import { notifications } from '@mantine/notifications'
import { useEffect, useMemo } from 'react'
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

/** Pausa mínima entre envíos: la cuota de la Gmail API permite unos 2,5 correos por segundo. */
const MIN_INTERVAL = 400
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type SendMessage = (message: Uint8Array) => Promise<void>

let stopRequested = false

async function deliver(sendMessage: SendMessage, fields: MessageFields, email: RenderedEmail) {
  // Los archivos ya están en el árbol: solo el envío necesita la sesión de Google.
  const message = buildMessage(fields, await Promise.all(email.attachments.map(buildAttachment)))
  await sendMessage(message)
}

/** Detiene el envío en curso antes del siguiente correo. */
export function stopSending() {
  stopRequested = true
}

/** Pendiente: ni enviado ni sin confirmar (un no confirmado pudo haber salido; se reintenta aparte). */
const isPending = (status: SendStatus | undefined) => status?.state !== 'sent' && status?.state !== 'unconfirmed'

/**
 * Envía, de a uno y en el orden de Review, los correos incluidos pendientes, o con mode
 * "unconfirmed" solo los no confirmados. Sigue ante errores de un correo.
 *
 * Mientras dura, el store no deja cambiar los correos ni cuáles se envían (ver isSending): la
 * lista que se toma al empezar sigue siendo la que muestra Review.
 */
export async function sendAll(sendMessage: SendMessage, mode: SendMode, { minInterval = MIN_INTERVAL } = {}) {
  // Si quedó texto sin procesar (se acaba de escribir), los correos se regeneran antes de enviar.
  flushEmails()
  const state = useStore.getState()
  // Una carga en curso cambiaría los correos a mitad del envío; la interfaz no deja llegar aquí.
  if (isSending(state) || state.loads > 0) return
  const { emails, statuses } = state
  const pending = emails.filter((email) =>
    mode === 'pending' ? isPending(statuses.get(email.index)) : statuses.get(email.index)?.state === 'unconfirmed',
  )
  if (pending.length === 0) return
  stopRequested = false
  // En la misma tarea que la lista: desde aquí el store queda bloqueado.
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
        // Si se cortó la conexión, los siguientes fallarían igual: se detiene aquí.
        setStatus(email.index, { state: 'unconfirmed', error })
        setSendState({ stopReason: 'The connection was lost.' })
        break
      }
      setStatus(email.index, { state: 'failed', error })
      // Sin sesión o sin cuota no tiene sentido seguir: el resto queda pendiente.
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

/** Envía el primer correo a una dirección de prueba: sin Cc ni Bcc, y con "[Test]" en el asunto. */
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

/** Advierte al cerrar o recargar la página en medio de un envío. */
export function useWarnWhileSending() {
  const running = useStore((state) => state.progress !== null)
  useEffect(() => {
    if (!running) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])
}

/**
 * Estado y acciones de envío para la tarjeta Send, la barra fija del teléfono y el diálogo de
 * confirmación. Se re-dibujan cuando cambian los correos o el envío, no al escribir.
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
    // La prueba ignora los destinatarios de la fila, así que solo importan los errores de render.
    const firstRenders = emails[0]?.problems.every((problem) =>
      (ADDRESS_FIELDS as ProblemField[]).includes(problem.field),
    )
    return {
      sent,
      failed,
      pending,
      unconfirmed,
      firstRenders: Boolean(firstRenders),
      // Solo bloquean los problemas de los correos que faltan por enviar.
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
