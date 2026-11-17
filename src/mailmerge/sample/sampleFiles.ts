import { buildTree, fileNode, type TreeEntry } from '../attachments/tree.ts'

/**
 * Árbol de archivos de ejemplo para probar los adjuntos sin Google (solo en desarrollo).
 * Las carpetas usan el RUT sin puntos, así que la columna rut de la planilla de ejemplo
 * necesita un paso "Replace ." para calzar. Falta la carpeta del RUT 11223344-K a propósito.
 */
export function sampleFiles() {
  const encoder = new TextEncoder()
  const file = (path: string, text: string): TreeEntry => {
    return { path, data: encoder.encode(text) }
  }

  const ruts = ['12345678-5', '9876543-3', '15234567-4', '20456789-1', '18765432-7', '7654321-6', '21345678-4', '16987654-1', '19876543-0']
  const entries = ruts.flatMap((rut) => [
    file(`Alumnos/${rut}/certificado-alumno-regular.txt`, `Certificado de alumno regular\nRUT ${rut}\n`),
    file(`Alumnos/${rut}/informe-notas.txt`, `Informe de notas\nRUT ${rut}\n`),
  ])
  entries.push(file('Alumnos/12345678-5/anexos/autorizacion-salida.txt', 'Autorización de salida pedagógica\n'))

  const cursos = ['3° Medio A', '1° Básico B', '5° Básico A', '2° Medio C', '4° Medio B', '8° Básico A', 'Kínder', '6° Básico C', '1° Medio A', '7° Básico B']
  entries.push(...cursos.map((curso) => file(`Cursos/${curso}/horario.txt`, `Horario ${curso}\n`)))
  entries.push(file('Reglamento interno 2026.txt', 'Reglamento interno\n'))

  return buildTree('Documentos colegio (sample)', entries)
}

/** Un archivo de ejemplo para adjuntar a todos los correos. */
export function sampleSharedFile() {
  return fileNode('Calendario escolar 2026.txt', new TextEncoder().encode('Calendario escolar 2026\n'))
}
