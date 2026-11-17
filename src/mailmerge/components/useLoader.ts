import { useRef, useState, type DragEvent } from 'react'
import type { LoadProgress } from '../sources.ts'
import { isSending, trackLoad, useSending } from '../store.ts'

export interface Loader {
  progress: LoadProgress | null
  error: string | null
  /** Cambia con cada carga: reinicia los tiempos del indicador. */
  loadId: number
  /** Ejecuta una carga con su avance; un error queda en `error`. */
  run: (message: string, task: (onProgress: (progress: LoadProgress) => void) => Promise<void>) => Promise<void>
  /** Muestra un error sin cargar nada (archivos rechazados antes de leerlos). */
  fail: (error: string | null) => void
}

export function useLoader(): Loader {
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadId, setLoadId] = useState(0)

  async function run(message: string, task: (onProgress: (progress: LoadProgress) => void) => Promise<void>) {
    // Mientras se envía no se carga nada: cambiaría los correos que muestra Review.
    if (isSending()) return
    setProgress({ message })
    setError(null)
    setLoadId((id) => id + 1)
    try {
      await trackLoad(() => task(setProgress))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProgress(null)
    }
  }

  return { progress, error, loadId, run, fail: setError }
}

/** Lo soltado sobre una zona: los archivos, y los nombres de las carpetas (que no se pueden leer). */
export interface Dropped {
  files: File[]
  folders: string[]
}

/**
 * Soltar archivos sobre una zona. `active` mientras se arrastran archivos encima. Solo reacciona
 * a archivos del sistema, no a lo que se arrastra dentro de la página.
 */
export function useFileDrop(onDrop: (dropped: Dropped) => void, disabled = false) {
  const [active, setActive] = useState(false)
  const sending = useSending()
  disabled ||= sending
  // dragenter/dragleave se disparan también al pasar sobre los hijos.
  const depth = useRef(0)
  const hasFiles = (event: DragEvent) => !disabled && event.dataTransfer.types.includes('Files')

  return {
    active,
    props: {
      onDragEnter(event: DragEvent) {
        if (!hasFiles(event)) return
        event.preventDefault()
        depth.current++
        setActive(true)
      },
      onDragOver(event: DragEvent) {
        if (!hasFiles(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      },
      onDragLeave(event: DragEvent) {
        if (!hasFiles(event)) return
        if (--depth.current <= 0) {
          depth.current = 0
          setActive(false)
        }
      },
      onDrop(event: DragEvent) {
        if (!hasFiles(event)) return
        event.preventDefault()
        depth.current = 0
        setActive(false)
        const dropped: Dropped = { files: [], folders: [] }
        for (const item of event.dataTransfer.items) {
          if (item.kind !== 'file') continue
          const file = item.getAsFile()
          if (!file) continue
          if (item.webkitGetAsEntry()?.isDirectory) dropped.folders.push(file.name)
          else dropped.files.push(file)
        }
        onDrop(dropped)
      },
    },
  }
}
