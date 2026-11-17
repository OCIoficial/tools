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
  /** Con datos ya cargados se muestra en una línea, para no empujar la tabla hacia abajo. */
  compact: boolean
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

/**
 * Zona para pegar celdas copiadas de una planilla. Es editable solo para recibir el pegado
 * (Ctrl+V, o "Pegar" del menú al mantener presionado en el teléfono); no acepta texto escrito.
 * El evento paste no pide permisos, a diferencia de navigator.clipboard.
 */
export function PasteArea({ onPaste, onError, compact }: Props) {
  const [focused, setFocused] = useState(false)
  const touch = usePrimaryTouch()
  // Mientras se envía no se reemplazan los datos.
  const sending = useSending()
  const hintId = useId()
  const shortcut = isMac ? '⌘V' : 'Ctrl+V'

  // Una instrucción para este dispositivo, no todas las variantes.
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
      {/* Capa editable transparente sobre toda la zona: recibe el foco, el pegado y el menú del teléfono. */}
      <div
        className={classes.target}
        contentEditable={!sending}
        aria-disabled={sending || undefined}
        suppressContentEditableWarning
        // Sin teclado en pantalla: en el teléfono solo se necesita el menú Pegar.
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
