import { em } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'

/**
 * Consultas sobre la pantalla y el dispositivo. Se leen de inmediato (no en un efecto), para
 * que el primer render no muestre la versión equivocada y luego cambie.
 */
const useMedia = (query: string) => useMediaQuery(query, false, { getInitialValueInEffect: false })

/**
 * Pantalla angosta, por debajo del breakpoint `sm` de Mantine (48em), el mismo límite que usan
 * `hiddenFrom="sm"` y `visibleFrom="sm"`. Para el layout: barra inferior, lista o vista previa en Review.
 */
export function useIsMobile(): boolean {
  return useMedia(`(max-width: ${em(767.9)})`)
}

/**
 * El puntero principal es el dedo: teléfono o tablet usada al tacto. Para instrucciones
 * ("mantén presionado" en vez de Ctrl+V) y para ocultar lo que necesita teclado físico (Vim).
 *
 * Se usa el puntero principal y no any-pointer: los teléfonos Samsung (y otros Android)
 * informan `any-pointer: fine` sin mouse, pero su puntero principal sí es `coarse`.
 */
export function usePrimaryTouch(): boolean {
  return useMedia('(pointer: coarse)')
}
