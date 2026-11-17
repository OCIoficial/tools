/**
 * Texto con celdas separadas por un carácter (tab al pegar, coma o punto y coma en un CSV).
 * Una celda con el separador, un salto de línea o comillas va entre comillas, y sus comillas
 * se duplican, como lo escriben Google Sheets, Excel y LibreOffice.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let i = 0
  while (i < text.length) {
    if (cell === '' && text[i] === '"') {
      // Celda entre comillas: termina en la comilla que no está duplicada.
      i++
      while (i < text.length && !(text[i] === '"' && text[i + 1] !== '"')) {
        cell += text[i]
        i += text[i] === '"' ? 2 : 1
      }
      i++
      continue
    }
    const char = text[i++]
    if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) rows.push([...row, cell])
  return rows
}

/** Quita las celdas vacías al final de cada fila, como la Sheets API, para no crear columnas vacías. */
export function trimRows(rows: string[][]): string[][] {
  return rows.map((cells) => {
    let end = cells.length
    while (end > 0 && cells[end - 1].trim() === '') end--
    return cells.slice(0, end)
  })
}

export const hasCells = (rows: string[][]) => rows.some((cells) => cells.length > 0)

const DELIMITERS = [',', ';', '\t', '|']

/**
 * Separador de un CSV: el que divide las primeras filas en la misma cantidad de columnas (más
 * de una). Excel en español guarda con punto y coma, porque la coma es el separador decimal.
 */
export function detectDelimiter(text: string): string {
  // Unas 50 filas bastan y evitan recorrer un archivo grande cuatro veces.
  const sample = text.split(/\r?\n/, 50).join('\n')
  let best = { delimiter: ',', score: 0 }
  for (const delimiter of DELIMITERS) {
    const counts = parseDelimited(sample, delimiter)
      .filter((cells) => cells.some((cell) => cell.trim() !== ''))
      .map((cells) => cells.length)
    if (counts.length === 0) continue
    // La cantidad de columnas más común, y en cuántas filas se repite.
    const frequency = new Map<number, number>()
    for (const count of counts) frequency.set(count, (frequency.get(count) ?? 0) + 1)
    const [columns, rows] = [...frequency].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
    if (columns < 2) continue
    // Primero la consistencia entre filas; a igual consistencia, más columnas.
    const score = rows / counts.length + columns / 1000
    if (score > best.score) best = { delimiter, score }
  }
  return best.delimiter
}

/**
 * Texto de un archivo: UTF-8 si es válido; si no, Windows-1252 (Latin-1), la codificación con
 * que Excel en Windows guarda los CSV, para que tildes y ñ no salgan rotas.
 */
export function decodeText(data: Uint8Array): string {
  try {
    // ignoreBOM: false (por defecto) quita la marca BOM de UTF-8 que agrega Excel.
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    return new TextDecoder('windows-1252').decode(data)
  }
}

/** Lee un CSV: detecta codificación y separador, y respeta la línea "sep=;" que agrega Excel. */
export function parseCsv(data: Uint8Array): string[][] {
  let text = decodeText(data)
  const declared = /^sep=(.)\r?\n/.exec(text)
  if (declared) text = text.slice(declared[0].length)
  return trimRows(parseDelimited(text, declared ? declared[1] : detectDelimiter(text)))
}
