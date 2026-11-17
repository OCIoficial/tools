import { LoadingProgress } from './LoadingProgress.tsx'
import { Notice } from './Notice.tsx'
import type { Loader } from './useLoader.ts'

/** Avance y error de una carga. */
export function LoadStatus({ loader, title }: { loader: Loader; title: string }) {
  return (
    <>
      {/* key: cada carga empieza de cero los tiempos del indicador y de la barra. */}
      {loader.progress && <LoadingProgress key={loader.loadId} progress={loader.progress} />}
      {loader.error && (
        <Notice tone="error" title={title}>
          {/* Una línea por archivo que falló. */}
          {loader.error.split('\n').map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </Notice>
      )}
    </>
  )
}
