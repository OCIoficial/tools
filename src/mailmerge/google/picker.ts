import { loadPicker, pick, pickFolder, pickMany } from '../../shared/google/index.ts'

export { pickFolder }

export async function pickSpreadsheet(token: string) {
  await loadPicker()
  const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setMode(google.picker.DocsViewMode.LIST)
  return pick(token, 'Choose a spreadsheet', view)
}

const ARCHIVE_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'application/x-compressed-tar',
]

export async function pickArchive(token: string) {
  await loadPicker()
  const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setMimeTypes(ARCHIVE_TYPES.join(','))
    .setMode(google.picker.DocsViewMode.LIST)
  return pick(token, 'Choose a ZIP or TAR.GZ file', view)
}

/** Any file (not folders), several at once. */
export async function pickFiles(token: string) {
  await loadPicker()
  const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false)
    .setMode(google.picker.DocsViewMode.LIST)
  return pickMany(token, 'Choose files to attach to every email', view, true)
}
