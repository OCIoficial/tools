import type { ReactNode } from 'react'
import classes from './Notice.module.css'

/**
 * warning: algo que el usuario debe corregir antes de enviar (un correo inválido, un adjunto que falta).
 * error: algo que impide generar los correos (sintaxis del template).
 */
export type Tone = 'warning' | 'error'

const iconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
} as const

export function WarningIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...iconProps} width={size} height={size}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

export function ErrorIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...iconProps} width={size} height={size}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  )
}

interface Props {
  tone: Tone
  title?: ReactNode
  children?: ReactNode
}

export function Notice({ tone, title, children }: Props) {
  return (
    <div className={classes.notice} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      <span className={classes.icon}>{tone === 'error' ? <ErrorIcon /> : <WarningIcon />}</span>
      <div className={classes.content}>
        {title && <p className={classes.title}>{title}</p>}
        {children}
      </div>
    </div>
  )
}
