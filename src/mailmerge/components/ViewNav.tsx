import { SegmentedControl, UnstyledButton } from '@mantine/core'
import { IconListCheck, IconPencil } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useStore } from '../store.ts'
import classes from './ViewNav.module.css'

export type View = 'edit' | 'review'

/** Count of emails with problems, inline with the Review label. */
function ReviewLabel() {
  // Only the counter reads from the store: when it changes, the whole header is not redrawn.
  const problemCount = useStore((state) => state.problemCount)
  return (
    <span className={classes.viewLabel}>
      Review
      {problemCount > 0 && (
        <span className={classes.viewCounter} title={`${problemCount} emails need fixing`}>
          {problemCount}
        </span>
      )}
    </span>
  )
}

interface Props {
  view: View
  onViewChange: (view: View) => void
}

/** Edit / Review switch for the header (hidden on a phone, which uses BottomNav). */
export function ViewControl({ view, onViewChange }: Props) {
  return (
    // Equal-width segments; the count goes inline (like GitHub's Counter) without changing the width.
    <SegmentedControl
      visibleFrom="sm"
      aria-label="View"
      classNames={{ control: classes.viewControl }}
      value={view}
      onChange={(value) => onViewChange(value as View)}
      data={[
        { value: 'edit', label: 'Edit' },
        { value: 'review', label: <ReviewLabel /> },
      ]}
    />
  )
}

/**
 * Bottom bar on a phone: Edit and Review stay within thumb reach instead of being squeezed
 * into the header.
 */
export function BottomNav({ view, onViewChange }: Props) {
  const tabs: { value: View; label: ReactNode; icon: ReactNode }[] = [
    { value: 'edit', label: 'Edit', icon: <IconPencil size={22} stroke={1.75} /> },
    {
      value: 'review',
      label: <ReviewLabel />,
      icon: <IconListCheck size={22} stroke={1.75} />,
    },
  ]
  return (
    <nav className={classes.bottomNav} aria-label="View">
      {tabs.map((tab) => (
        <UnstyledButton
          key={tab.value}
          className={classes.bottomTab}
          aria-current={view === tab.value ? 'page' : undefined}
          data-active={view === tab.value || undefined}
          onClick={() => onViewChange(tab.value)}
        >
          <span className={classes.bottomIcon}>{tab.icon}</span>
          <span className={classes.bottomLabel}>{tab.label}</span>
        </UnstyledButton>
      ))}
    </nav>
  )
}
