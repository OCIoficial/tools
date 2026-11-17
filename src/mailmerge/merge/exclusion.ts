/** Includes or excludes several rows at once. Returns a new set. */
export function setIncluded(excluded: Set<number>, indices: number[], include: boolean): Set<number> {
  const next = new Set(excluded)
  for (const index of indices) {
    if (include) next.delete(index)
    else next.add(index)
  }
  return next
}

/**
 * Rows between `from` and `to` (both included) in the order they are shown, for Shift+click.
 * In Review the list may be filtered, so the range follows what is visible and not the row numbers.
 */
export function rangeBetween(order: number[], from: number | null, to: number): number[] {
  const end = order.indexOf(to)
  const start = from === null ? -1 : order.indexOf(from)
  if (start === -1 || end === -1) return [to]
  return order.slice(Math.min(start, end), Math.max(start, end) + 1)
}
