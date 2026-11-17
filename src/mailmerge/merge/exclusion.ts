/** Incluye o excluye varias filas a la vez. Devuelve un conjunto nuevo. */
export function setIncluded(excluded: Set<number>, indices: number[], include: boolean): Set<number> {
  const next = new Set(excluded)
  for (const index of indices) {
    if (include) next.delete(index)
    else next.add(index)
  }
  return next
}

/**
 * Filas entre `from` y `to` (ambas incluidas) en el orden en que se muestran, para Shift+clic.
 * En Review la lista puede estar filtrada, así que el rango sigue lo visible y no los números de fila.
 */
export function rangeBetween(order: number[], from: number | null, to: number): number[] {
  const end = order.indexOf(to)
  const start = from === null ? -1 : order.indexOf(from)
  if (start === -1 || end === -1) return [to]
  return order.slice(Math.min(start, end), Math.max(start, end) + 1)
}
