import { AuthError, pickFolder, type PickedFile } from '../../shared/google/index.ts'

export interface DriveFolder {
  id: string
  name: string
}

/** Rate limits and transient server errors, worth retrying. */
const RETRYABLE = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 4

export async function chooseFolder(token: string): Promise<DriveFolder | null> {
  const folder: PickedFile | null = await pickFolder(token, 'Choose a folder for the PDFs')
  return folder && { id: folder.id, name: folder.name }
}

/** Creates a PDF file in a folder (multipart upload: metadata and content in one request). */
export async function uploadPdf(token: string, folderId: string, name: string, bytes: Uint8Array): Promise<void> {
  const metadata = { name, mimeType: 'application/pdf', parents: [folderId] }
  const body = new FormData()
  body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  body.append('file', new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const url =
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id'

  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
    if (response.ok) return
    if (response.status === 401) throw new AuthError('Your Google session expired. Sign in again.')
    if (!RETRYABLE.has(response.status) || attempt === MAX_ATTEMPTS) {
      const error = await response.json().catch(() => null)
      throw new Error(error?.error?.message ?? `Google Drive error ${response.status}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500))
  }
}
