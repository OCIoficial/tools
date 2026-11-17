import type { Origin } from '../sources.ts'
import type { AttachmentTree, FileNode } from './tree.ts'

/** Un archivo que va en todos los correos. */
export interface SharedAttachment {
  id: string
  origin: Origin
  file: FileNode
  /** Nombre del adjunto, con variables; vacío = el del archivo. */
  name: string
}

/** Una ruta = un adjunto, relativa al árbol de su fuente. */
export interface AttachmentPath {
  /** Con comodines, lo que calce va en un solo ZIP. */
  path: string
  /** Nombre del adjunto, con variables; vacío = automático. */
  name: string
  /** Si es obligatorio, que no se encuentre es un problema; si no, el correo sale sin ese adjunto. */
  required: boolean
}

/** Una carpeta o archivo comprimido con sus rutas: de aquí salen los adjuntos de cada fila. */
export interface PathSource {
  id: string
  origin: Origin
  tree: AttachmentTree
  paths: AttachmentPath[]
}

export const newAttachmentId = () => crypto.randomUUID()
