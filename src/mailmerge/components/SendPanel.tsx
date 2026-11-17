import { Button, Card, Group, Modal, Progress, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconMailForward, IconPlayerStop, IconSend } from '@tabler/icons-react'
import { plural, useSendControls, type SendControls } from '../mail/sending.ts'
import { useIsMobile } from '../media.ts'
import { Notice, WarningIcon } from './Notice.tsx'
import classes from './SendPanel.module.css'

function TestButton({ controls, short = false }: { controls: SendControls; short?: boolean }) {
  return (
    <Button
      variant="default"
      leftSection={<IconMailForward size={16} />}
      loading={controls.testing}
      disabled={!controls.canTest}
      onClick={controls.sendTest}
    >
      {/* En la barra del teléfono no hay espacio para "Send test". */}
      {short ? 'Test' : 'Send test'}
    </Button>
  )
}

function SendingProgress({ controls }: { controls: SendControls }) {
  const progress = controls.progress
  if (!progress) return null
  return (
    <Stack gap={6}>
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">
          Sending {Math.min(progress.done + 1, progress.total)} of {progress.total}…
        </Text>
        <Button variant="default" leftSection={<IconPlayerStop size={16} />} onClick={controls.stop}>
          Stop
        </Button>
      </Group>
      <Progress value={(progress.done / progress.total) * 100} />
    </Stack>
  )
}

/** Correos sin confirmar: pudieron haber salido. Se reintentan solo a pedido, tras revisar Gmail. */
function UnconfirmedNote({ controls, compact = false }: { controls: SendControls; compact?: boolean }) {
  const count = controls.unconfirmed.length
  if (count === 0 || controls.running) return null
  const text = (
    <>
      {count === 1 ? "1 email wasn't" : `${count} emails weren't`} confirmed by Gmail and may have been sent. Check your
      Sent folder in Gmail before retrying.
    </>
  )
  const retry = (
    <Button
      variant="default"
      size={compact ? 'xs' : 'sm'}
      disabled={!controls.signedIn}
      onClick={() => controls.setConfirming('unconfirmed')}
    >
      {controls.retryLabel}
    </Button>
  )
  if (compact) {
    return (
      <Group gap="xs" wrap="nowrap" justify="space-between">
        <Text size="sm" c="orange">
          ? {count} not confirmed
        </Text>
        {retry}
      </Group>
    )
  }
  return (
    <Notice tone="warning" title={count === 1 ? '1 email not confirmed' : `${count} emails not confirmed`}>
      <Stack gap="xs" align="flex-start">
        <span>{text}</span>
        {retry}
      </Stack>
    </Notice>
  )
}

function BlockingNote({ blocking }: { blocking: number }) {
  return (
    <Group gap={6} wrap="nowrap" align="flex-start">
      <Text c="orange" style={{ display: 'flex', paddingTop: 2 }}>
        <WarningIcon size={14} />
      </Text>
      <Text size="sm" c="dimmed">
        Fix the {blocking === 1 ? 'email that needs' : `${blocking} emails that need`} fixing to send.
      </Text>
    </Group>
  )
}

/** Una carga en curso cambiaría los correos a mitad del envío. */
function LoadingNote() {
  return (
    <Text size="sm" c="dimmed">
      Wait for the files to finish loading to send.
    </Text>
  )
}

export function SendPanel() {
  const controls = useSendControls()
  // Teléfono: los botones y el progreso van en la barra fija; aquí queda solo la dirección de prueba.
  const compact = useIsMobile()
  const { sent, failed, pending, unconfirmed, emails, blocking } = controls

  const testInput = (
    <TextInput
      label="Test email"
      description={
        compact
          ? 'Test sends the first email to this address, without Cc or Bcc.'
          : 'Sends the first email to this address, without Cc or Bcc.'
      }
      value={controls.testTo}
      onChange={(event) => controls.setTestAddress(event.currentTarget.value)}
      style={{ flex: 1, minWidth: 200 }}
    />
  )

  if (compact) {
    return (
      <Card withBorder>
        <Stack gap="sm">
          <Title order={4}>4. Send</Title>
          {testInput}
        </Stack>
      </Card>
    )
  }

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Title order={4}>4. Send</Title>
        <Group align="end" gap="sm">
          {testInput}
          <TestButton controls={controls} />
        </Group>

        {controls.progress ? (
          <SendingProgress controls={controls} />
        ) : pending.length > 0 ? (
          <Button
            leftSection={<IconSend size={16} />}
            disabled={!controls.canSend}
            onClick={() => controls.setConfirming('pending')}
          >
            {controls.sendLabel}
          </Button>
        ) : (
          emails.length > 0 &&
          unconfirmed.length === 0 && (
            <Text size="sm" c="dimmed">
              All {plural(emails.length, 'email was', 'emails were')} sent.
            </Text>
          )
        )}

        {!controls.running && (sent.length > 0 || failed.length > 0 || unconfirmed.length > 0) && (
          <Text size="sm" c="dimmed">
            {plural(sent.length, 'email', 'emails')} sent
            {failed.length > 0 && `, ${failed.length} failed`}
            {unconfirmed.length > 0 && `, ${unconfirmed.length} not confirmed`}
            {(failed.length > 0 || unconfirmed.length > 0) && '. They are marked in the list'}.
          </Text>
        )}
        <UnconfirmedNote controls={controls} />
        {!controls.running && controls.stopReason && (
          <Notice tone="error" title="Sending stopped">
            {controls.stopReason} Emails not sent yet stay pending.
          </Notice>
        )}

        {blocking > 0 && <BlockingNote blocking={blocking} />}
        {controls.loading && <LoadingNote />}
      </Stack>
    </Card>
  )
}

/**
 * Barra fija sobre las pestañas del teléfono: Test y Send siempre al alcance del pulgar,
 * con una línea que explica por qué Send está deshabilitado.
 */
export function SendBar() {
  const controls = useSendControls()
  const { sent, failed, pending, unconfirmed, emails, blocking } = controls

  if (controls.progress) {
    return (
      <div className={classes.bar}>
        <SendingProgress controls={controls} />
      </div>
    )
  }

  if (pending.length === 0) {
    return (
      <div className={classes.bar}>
        {unconfirmed.length > 0 ? (
          <UnconfirmedNote controls={controls} compact />
        ) : (
          <Text size="sm" c="dimmed">
            ✓ All {plural(emails.length, 'email was', 'emails were')} sent.
          </Text>
        )}
      </div>
    )
  }

  // Una sola línea de estado: primero el resultado del último envío, luego por qué no se puede enviar.
  let status = null
  // Lo no confirmado va primero: trae el botón para reintentar, y explica por qué se detuvo.
  if (unconfirmed.length > 0) {
    status = <UnconfirmedNote controls={controls} compact />
  } else if (controls.stopReason) {
    status = (
      <Text size="sm" c="red" lineClamp={2}>
        Sending stopped. {controls.stopReason}
      </Text>
    )
  } else if (sent.length > 0 || failed.length > 0) {
    status = (
      <Text size="sm" c="dimmed">
        ✓ {sent.length} sent{failed.length > 0 && ` · ✕ ${failed.length} failed`}
      </Text>
    )
  } else if (!controls.signedIn) {
    status = (
      <Text size="sm" c="dimmed">
        Sign in to send.
      </Text>
    )
  } else if (blocking > 0) {
    status = <BlockingNote blocking={blocking} />
  } else if (controls.loading) {
    status = <LoadingNote />
  }

  return (
    <div className={classes.bar}>
      {status}
      <Group gap="xs" wrap="nowrap">
        <TestButton controls={controls} short />
        <Button
          flex={1}
          leftSection={<IconSend size={16} />}
          disabled={!controls.canSend}
          onClick={() => controls.setConfirming('pending')}
        >
          {controls.sendLabel}
        </Button>
      </Group>
    </div>
  )
}

/** Confirmación del envío; una sola, sirve tanto a la tarjeta como a la barra. */
export function SendConfirmModal() {
  const controls = useSendControls()
  const retrying = controls.confirming === 'unconfirmed'
  const emails = retrying ? controls.unconfirmed : controls.pending
  const label = retrying ? controls.retryLabel : controls.sendLabel
  const attachmentCount = retrying
    ? emails.reduce((sum, email) => sum + email.attachments.length, 0)
    : controls.attachmentCount
  return (
    <Modal
      opened={controls.confirming !== false}
      onClose={() => controls.setConfirming(false)}
      title={`${label}?`}
      centered
    >
      <Stack gap="md">
        {retrying && (
          <Notice tone="warning" title="These may already have been sent">
            Gmail didn't confirm them, but they may have gone out. Check your Sent folder in Gmail first: retrying sends
            them again.
          </Notice>
        )}
        <Text size="sm">
          {plural(emails.length, 'email', 'emails')} will be sent from <b>{controls.account}</b>, one per row
          {attachmentCount > 0 && `, with ${plural(attachmentCount, 'attachment', 'attachments')} in total`}.
        </Text>
        <Text size="sm" c="dimmed">
          Sent emails can't be recalled. Keep this page open until sending finishes.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => controls.setConfirming(false)}>
            Cancel
          </Button>
          <Button leftSection={<IconSend size={16} />} onClick={controls.confirmSend}>
            {label}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
