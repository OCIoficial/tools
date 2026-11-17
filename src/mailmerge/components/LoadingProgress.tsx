import { Group, Loader, Progress, Stack, Text, VisuallyHidden } from '@mantine/core'
import { useEffect, useState } from 'react'
import { formatSize } from '../attachments/tree.ts'
import type { LoadProgress } from '../sources.ts'
import classes from './LoadingProgress.module.css'

/** Something almost instant does not make the box appear and disappear. */
const SPINNER_DELAY = 300
/** The bar only appears once the wait is noticeable: a bar that fills in an instant cannot be read. */
const BAR_DELAY = 2000

function describe({ done, total, unit }: LoadProgress): string | null {
  if (done === undefined || !unit) return null
  if (unit === 'files') return total ? `${done} of ${total} files` : `${done} files`
  return total ? `${formatSize(done)} of ${formatSize(total)}` : `${formatSize(done)} downloaded`
}

/**
 * Load in progress: animated indicator after 300 ms, and a bar after 2 s if the progress can
 * be measured. For screen readers, the text is announced when the step changes and every 10 %.
 */
export function LoadingProgress({ progress }: { progress: LoadProgress }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const timers = [SPINNER_DELAY, BAR_DELAY].map((delay) => setTimeout(() => setElapsed(Date.now() - started), delay))
    return () => timers.forEach(clearTimeout)
  }, [])

  const percent =
    progress.done !== undefined && progress.total ? Math.min(100, (progress.done / progress.total) * 100) : null
  const detail = describe(progress)
  // Announcement for screen readers: it only changes with the step or every 10 %, not with each chunk received.
  const announcement = percent === null ? progress.message : `${progress.message}, ${Math.floor(percent / 10) * 10}%`

  if (elapsed < SPINNER_DELAY) return null

  return (
    <div className={classes.box}>
      <Stack gap={6}>
        {/* On narrow screens the detail wraps to another line instead of cutting off the file name. */}
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Loader size={18} aria-hidden style={{ flex: 'none', marginTop: 1 }} />
          <Group gap={4} style={{ flex: 1, minWidth: 0, columnGap: 12 }} justify="space-between">
            <Text size="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>
              {progress.message}
            </Text>
            {detail && (
              <Text
                size="xs"
                c="dimmed"
                style={{ fontVariantNumeric: 'tabular-nums', alignSelf: 'center' }}
                aria-hidden
              >
                {detail}
                {percent !== null && elapsed >= BAR_DELAY && ` · ${Math.floor(percent)}%`}
              </Text>
            )}
          </Group>
        </Group>
        {percent !== null && elapsed >= BAR_DELAY && (
          <Progress value={percent} size="sm" aria-label={progress.message} transitionDuration={200} />
        )}
      </Stack>
      <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>
    </div>
  )
}
