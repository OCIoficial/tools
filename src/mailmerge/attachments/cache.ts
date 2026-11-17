/**
 * Caché acotado por tamaño: al pasar el límite se descarta lo usado hace más tiempo. Sirve para
 * que lo que se repite en todos los correos (un adjunto común, un ZIP igual para todos) se
 * procese una vez, sin guardar todo lo que solo aparece en un correo.
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
    // Al final del Map: el más reciente.
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
