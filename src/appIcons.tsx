import { IconId } from '@tabler/icons-react'

/** Two lines converging into an envelope: many rows → one email each. */
export function MergeMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={(size * 30) / 24} height={size} viewBox="0 0 30 24" fill="none" aria-hidden>
      <path d="M1 5c5 0 6 7 11 7M1 19c5 0 6-7 11-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="13" y="5" width="16" height="14" rx="2" fill="currentColor" />
      <path
        d="M14.5 7l6.5 5 6.5-5"
        stroke="var(--mantine-color-body)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CredentialsMark({ size = 24 }: { size?: number }) {
  return <IconId size={size} stroke={1.75} />
}
