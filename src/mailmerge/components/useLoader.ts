import { useRef, useState, type DragEvent } from 'react'
import type { LoadProgress } from '../sources.ts'
import { isSending, trackLoad, useSending } from '../store.ts'

export interface Loader {
  progress: LoadProgress | null
  error: string | null
  /** Changes with each load: resets the indicator timers. */
  loadId: number
  /** Runs a load with its progress; an error ends up in `error`. */
  run: (message: string, task: (onProgress: (progress: LoadProgress) => void) => Promise<void>) => Promise<void>
  /** Shows an error without loading anything (files rejected before reading them). */
  fail: (error: string | null) => void
}

export function useLoader(): Loader {
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadId, setLoadId] = useState(0)

  async function run(message: string, task: (onProgress: (progress: LoadProgress) => void) => Promise<void>) {
    // While sending nothing is loaded: it would change the emails Review shows.
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

/** What was dropped on a zone: the files, and the names of the folders (which cannot be read). */
export interface Dropped {
  files: File[]
  folders: string[]
}

/**
 * Dropping files on a zone. `active` while files are dragged over it. It only reacts
 * to files from the system, not to things dragged within the page.
 */
export function useFileDrop(onDrop: (dropped: Dropped) => void, disabled = false) {
  const [active, setActive] = useState(false)
  const sending = useSending()
  disabled ||= sending
  // dragenter/dragleave also fire when passing over the children.
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
