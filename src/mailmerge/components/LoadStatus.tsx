import { LoadingProgress } from './LoadingProgress.tsx'
import { Notice } from './Notice.tsx'
import type { Loader } from './useLoader.ts'

/** Progress and error of a load. */
export function LoadStatus({ loader, title }: { loader: Loader; title: string }) {
  return (
    <>
      {/* key: each load restarts the indicator and bar timers from zero. */}
      {loader.progress && <LoadingProgress key={loader.loadId} progress={loader.progress} />}
      {loader.error && (
        <Notice tone="error" title={title}>
          {/* One line per file that failed. */}
          {loader.error.split('\n').map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </Notice>
      )}
    </>
  )
}
