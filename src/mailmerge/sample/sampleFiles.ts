import { buildTree, fileNode, type TreeEntry } from '../attachments/tree.ts'

/**
 * Sample file tree to try attachments without Google (development only).
 * The folders use the RUT without dots, so the rut column of the sample spreadsheet
 * needs a "Replace ." step to match. The folder for RUT 11223344-K is missing on purpose.
 */
export function sampleFiles() {
  const encoder = new TextEncoder()
  const file = (path: string, text: string): TreeEntry => {
    return { path, data: encoder.encode(text) }
  }

  const ruts = ['12345678-5', '9876543-3', '15234567-4', '20456789-1', '18765432-7', '7654321-6', '21345678-4', '16987654-1', '19876543-0']
  const entries = ruts.flatMap((rut) => [
    file(`Students/${rut}/enrollment-certificate.txt`, `Enrollment certificate\nRUT ${rut}\n`),
    file(`Students/${rut}/grade-report.txt`, `Grade report\nRUT ${rut}\n`),
  ])
  entries.push(file('Students/12345678-5/annexes/field-trip-authorization.txt', 'Field trip authorization\n'))

  const cursos = ['3° Medio A', '1° Básico B', '5° Básico A', '2° Medio C', '4° Medio B', '8° Básico A', 'Kínder', '6° Básico C', '1° Medio A', '7° Básico B']
  entries.push(...cursos.map((curso) => file(`Grades/${curso}/schedule.txt`, `Schedule ${curso}\n`)))
  entries.push(file('School rules 2026.txt', 'School rules\n'))

  return buildTree('School documents (sample)', entries)
}

/** A sample file to attach to every email. */
export function sampleSharedFile() {
  return fileNode('School calendar 2026.txt', new TextEncoder().encode('School calendar 2026\n'))
}
