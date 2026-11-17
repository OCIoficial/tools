import { Text } from '@mantine/core'
import { IconClipboard } from '@tabler/icons-react'
import { useId, useState } from 'react'
import { readPastedTable } from '../clipboard.ts'
import { usePrimaryTouch } from '../media.ts'
import { useSending } from '../store.ts'
import classes from './PasteArea.module.css'

interface Props {
  onPaste: (rows: string[][]) => void
  onError: (message: string) => void
  /** With data already loaded it is shown on one line, so it does not push the table down. */
  compact: boolean
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

/**
 * Zone to paste cells copied from a spreadsheet. It is editable only to receive the paste
 * (Ctrl+V, or "Paste" from the menu after a long press on a phone); it does not accept typed text.
 * The paste event asks for no permissions, unlike navigator.clipboard.
 */
export function PasteArea({ onPaste, onError, compact }: Props) {
  const [focused, setFocused] = useState(false)
  const touch = usePrimaryTouch()
  // While sending, the data is not replaced.
  const sending = useSending()
  const hintId = useId()
  const shortcut = isMac ? '⌘V' : 'Ctrl+V'

  // One instruction for this device, not every variant.
  const hint = touch
    ? 'Copy cells in Google Sheets or Excel, then touch and hold here and tap Paste.'
    : focused
      ? `Press ${shortcut} to paste.`
      : `Copy cells in Google Sheets or Excel, then click here and press ${shortcut}.`

  return (
    <div className={classes.area} data-compact={compact || undefined} data-focused={focused || undefined}>
      <IconClipboard size={compact ? 16 : 20} className={classes.icon} aria-hidden />
      <div>
        <Text size="sm" fw={600}>
          {compact ? 'Paste cells to replace the data' : 'Paste cells'}
        </Text>
        {!compact && (
          <Text size="xs" c="dimmed" id={hintId}>
            {hint}
          </Text>
        )}
      </div>
      {/* Transparent editable layer over the whole zone: it gets the focus, the paste and the phone's menu. */}
      <div
        className={classes.target}
        contentEditable={!sending}
        aria-disabled={sending || undefined}
        suppressContentEditableWarning
        // No on-screen keyboard: on a phone only the Paste menu is needed.
        inputMode="none"
        role="textbox"
        aria-label="Paste cells"
        aria-describedby={compact ? undefined : hintId}
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onBeforeInput={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
        onPaste={(event) => {
          event.preventDefault()
          if (sending) return
          try {
            onPaste(readPastedTable(event.clipboardData))
          } catch (e) {
            onError((e as Error).message)
          }
        }}
      />
    </div>
  )
}
