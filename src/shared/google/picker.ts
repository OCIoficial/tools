import { googleConfig } from './config.ts'
import { loadScript } from './loadScript.ts'

let pickerReady: Promise<void> | null = null

/** Loads Google Picker. The views use google.picker, which only exists after this resolves. */
export function loadPicker(): Promise<void> {
  pickerReady ??= loadScript('https://apis.google.com/js/api.js').then(
    () => new Promise<void>((resolve) => gapi.load('picker', () => resolve())),
  )
  return pickerReady
}

export interface PickedFile {
  id: string
  name: string
  mimeType: string
}

/** Opens Google Picker with a view. Returns what was chosen, or null if the user cancels. */
export async function pickMany(
  token: string,
  title: string,
  view: google.picker.DocsView,
  multiple = false,
): Promise<PickedFile[] | null> {
  await loadPicker()
  return new Promise((resolve) => {
    const builder = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(googleConfig.apiKey)
      .setAppId(googleConfig.appId)
      .setLocale('en')
      .setTitle(title)
      .setCallback((data) => {
        const action = data[google.picker.Response.ACTION]
        if (action === google.picker.Action.PICKED) {
          const docs = data[google.picker.Response.DOCUMENTS] ?? []
          resolve(
            docs.map((doc) => ({
              id: doc[google.picker.Document.ID] ?? '',
              name: doc[google.picker.Document.NAME] ?? '',
              mimeType: doc[google.picker.Document.MIME_TYPE] ?? '',
            })),
          )
        } else if (action === google.picker.Action.CANCEL) {
          resolve(null)
        }
      })
    if (multiple) builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
    builder.build().setVisible(true)
  })
}

export async function pick(token: string, title: string, view: google.picker.DocsView): Promise<PickedFile | null> {
  return (await pickMany(token, title, view))?.[0] ?? null
}

/**
 * Chooses a Drive folder. With the drive.file scope, choosing it in the Picker is what gives the
 * app access to create files inside it.
 */
export async function pickFolder(token: string, title = 'Choose a folder'): Promise<PickedFile | null> {
  await loadPicker()
  const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMimeTypes('application/vnd.google-apps.folder')
    .setMode(google.picker.DocsViewMode.LIST)
  return pick(token, title, view)
}
