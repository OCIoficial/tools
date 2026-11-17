import { em } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'

/**
 * Queries about the screen and the device. They are read right away (not in an effect), so
 * the first render does not show the wrong version and then change.
 */
const useMedia = (query: string) => useMediaQuery(query, false, { getInitialValueInEffect: false })

/**
 * Narrow screen, below Mantine's `sm` breakpoint (48em), the same limit used by
 * `hiddenFrom="sm"` and `visibleFrom="sm"`. For the layout: bottom bar, list or preview in Review.
 */
export function useIsMobile(): boolean {
  return useMedia(`(max-width: ${em(767.9)})`)
}

/**
 * The primary pointer is a finger: a phone or a tablet used by touch. For instructions
 * ("press and hold" instead of Ctrl+V) and to hide what needs a physical keyboard (Vim).
 *
 * The primary pointer is used, not any-pointer: Samsung phones (and other Android devices)
 * report `any-pointer: fine` without a mouse, but their primary pointer is `coarse`.
 */
export function usePrimaryTouch(): boolean {
  return useMedia('(pointer: coarse)')
}
