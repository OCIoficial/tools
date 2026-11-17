import { gunzip, unzip } from 'fflate'
import { buildTree, type AttachmentTree, type TreeEntry } from './tree.ts'

/** Archivos basura que agregan algunos compresores (macOS). */
const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$)/

function unzipAsync(data: Uint8Array) {
  return new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(data, (error, files) => (error ? reject(error) : resolve(files))),
  )
}

function gunzipAsync(data: Uint8Array) {
  return new Promise<Uint8Array>((resolve, reject) =>
    gunzip(data, (error, result) => (error ? reject(error) : resolve(result))),
  )
}

const isZip = (d: Uint8Array) => d[0] === 0x50 && d[1] === 0x4b && (d[2] === 0x03 || d[2] === 0x05)
const isGzip = (d: Uint8Array) => d[0] === 0x1f && d[1] === 0x8b
const isTar = (d: Uint8Array) => d.length >= 262 && new TextDecoder().decode(d.subarray(257, 262)) === 'ustar'

function readString(data: Uint8Array, offset: number, length: number): string {
  const bytes = data.subarray(offset, offset + length)
  const end = bytes.indexOf(0)
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end))
}

function readOctal(data: Uint8Array, offset: number, length: number): number {
  return parseInt(readString(data, offset, length).trim() || '0', 8)
}

/** Lector mínimo de tar (ustar, nombres largos de GNU y rutas pax). */
export function parseTar(data: Uint8Array): { files: Record<string, Uint8Array>; dirs: string[] } {
  const files: Record<string, Uint8Array> = {}
  const dirs: string[] = []
  let offset = 0
  let longName: string | null = null

  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break

    const size = readOctal(header, 124, 12)
    const type = String.fromCharCode(header[156] || 48)
    const prefix = readString(header, 345, 155)
    const name = longName ?? (prefix ? `${prefix}/${readString(header, 0, 100)}` : readString(header, 0, 100))
    const body = data.subarray(offset + 512, offset + 512 + size)
    longName = null

    if (type === 'L') {
      longName = readString(body, 0, body.length)
    } else if (type === 'x') {
      const path = new TextDecoder().decode(body).match(/\d+ path=([^\n]*)\n/)
      if (path) longName = path[1]
    } else if (type === '5') {
      dirs.push(name)
    } else if (type === '0' || type === '7') {
      files[name] = body.slice()
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return { files, dirs }
}

/** Lee un .zip, .tar, .tar.gz o .tgz y arma el árbol con su contenido. */
export async function readArchive(name: string, data: Uint8Array): Promise<AttachmentTree> {
  let files: Record<string, Uint8Array>
  let dirs: string[] = []

  if (isZip(data)) {
    files = await unzipAsync(data)
  } else {
    const tar = isGzip(data) ? await gunzipAsync(data) : data
    if (!isTar(tar)) throw new Error(`"${name}" is not a ZIP, TAR or TAR.GZ file.`)
    ;({ files, dirs } = parseTar(tar))
  }

  const entries: TreeEntry[] = Object.entries(files)
    .filter(([path]) => !path.endsWith('/') && !JUNK.test(path))
    .map(([path, data]) => ({ path, data }))
  dirs.push(...Object.keys(files).filter((path) => path.endsWith('/') && !JUNK.test(path)))

  return buildTree(name, entries, dirs)
}
