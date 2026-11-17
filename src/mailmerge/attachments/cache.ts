/**
 * Size-bounded cache: past the limit, the least recently used entries are dropped. It makes
 * what repeats in every email (a shared attachment, the same ZIP for everyone) get processed
 * once, without keeping everything that appears in only one email.
 */
export class LruCache<K, V> {
  private readonly entries = new Map<K, { value: V; size: number }>()
  private total = 0

  private readonly maxSize: number
  private readonly sizeOf: (value: V) => number

  constructor(maxSize: number, sizeOf: (value: V) => number) {
    this.maxSize = maxSize
    this.sizeOf = sizeOf
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    // At the end of the Map: the most recent.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    const size = this.sizeOf(value)
    const previous = this.entries.get(key)
    if (previous) {
      this.total -= previous.size
      this.entries.delete(key)
    }
    if (size > this.maxSize) return
    this.entries.set(key, { value, size })
    this.total += size
    for (const [oldest, entry] of this.entries) {
      if (this.total <= this.maxSize) break
      this.entries.delete(oldest)
      this.total -= entry.size
    }
  }
}
