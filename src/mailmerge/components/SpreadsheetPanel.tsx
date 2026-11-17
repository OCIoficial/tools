import { Button, Card, Checkbox, FileButton, Group, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { IconFlask, IconRefresh, IconTable, IconUpload } from '@tabler/icons-react'
import { useState } from 'react'
import { pastedSpreadsheet } from '../clipboard.ts'
import { fileSpreadsheet, SPREADSHEET_ACCEPT } from '../fileSpreadsheet.ts'
import { useGoogle } from '../google/index.ts'
import { toDataset } from '../merge/dataset.ts'
import { sheetKey } from '../merge/sheetSettings.ts'
import type { Spreadsheet, SpreadsheetSource } from '../sources.ts'
import { isSending, setDataset, settingsFor, trackLoad, updateSheetSettings, useStore } from '../store.ts'
import { NormalizedData } from './NormalizedData.tsx'
import { Notice } from './Notice.tsx'
import { PasteArea } from './PasteArea.tsx'

/** The loaded spreadsheet and the source that provides it, to switch sheets or reload it. */
interface Loaded {
  source: SpreadsheetSource
  spreadsheet: Spreadsheet
}

export function SpreadsheetPanel() {
  const google = useGoogle()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const spreadsheet = loaded?.spreadsheet ?? null
  const [sheet, setSheet] = useState<string | null>(null)
  // Raw values of the sheet, to rebuild the rows when the checkbox changes without fetching them again.
  const [values, setValues] = useState<string[][] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function withLoading(task: () => Promise<void>) {
    // While sending nothing is loaded: it would change the emails Review shows.
    if (isSending()) return
    setLoading(true)
    setError(null)
    try {
      await trackLoad(task)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const currentKey = spreadsheet && sheet ? sheetKey(spreadsheet.id, sheet) : null
  const hasHeader = useStore((state) => settingsFor(state, currentKey ?? undefined).hasHeader)
  const hasData = useStore((state) => state.dataset !== null)

  function emit(info: Spreadsheet, name: string, next: string[][], header: boolean) {
    setDataset({ ...toDataset(next, header), sheetKey: sheetKey(info.id, name) })
  }

  async function loadSheet({ source, spreadsheet: info }: Loaded, name: string) {
    const next = await source.loadSheet(info, name)
    setSheet(name)
    setValues(next)
    // Each sheet remembers whether its first row is a header.
    emit(info, name, next, settingsFor(useStore.getState(), sheetKey(info.id, name)).hasHeader)
  }

  function changeHasHeader(next: boolean) {
    if (!spreadsheet || !sheet || !currentKey) return
    updateSheetSettings(currentKey, { hasHeader: next })
    if (values) emit(spreadsheet, sheet, values, next)
  }

  const choose = (getSource: () => Promise<SpreadsheetSource>) =>
    withLoading(async () => {
      const source = await getSource()
      const picked = await source.pick()
      if (!picked) return
      const next = { source, spreadsheet: picked }
      setLoaded(next)
      await loadSheet(next, picked.sheets[0])
    })

  const chooseFromGoogle = () => choose(async () => google.spreadsheets)
  const chooseFromPaste = (rows: string[][]) => choose(async () => pastedSpreadsheet(rows))
  const chooseFromFile = (file: File | null) => file && choose(() => fileSpreadsheet(file))
  // Dynamic import inside DEV: the sample does not end up in the production build.
  const chooseSample = () => choose(async () => (await import('../sample/index.ts')).sampleSpreadsheets)

  return (
    <Card withBorder h="100%">
      <Stack gap="sm">
        <Title order={4}>1. Spreadsheet</Title>
        {/* As in Attachments: same width, in a row if the card is wide and stacked if not.
            The card is measured (container query), not the screen. */}
        <div style={{ containerType: 'inline-size' }}>
          <SimpleGrid type="container" cols={{ base: 1, '420px': 2 }} spacing="xs">
            <Button
              fullWidth
              leftSection={<IconTable size={16} />}
              onClick={chooseFromGoogle}
              loading={loading && !spreadsheet}
              disabled={!google.signedIn}
            >
              {spreadsheet ? 'Change spreadsheet' : 'Choose spreadsheet'}
            </Button>
            {/* CSV, Excel or LibreOffice; does not need Google. */}
            <FileButton onChange={chooseFromFile} accept={SPREADSHEET_ACCEPT}>
              {(props) => (
                <Button
                  variant="default"
                  fullWidth
                  leftSection={<IconUpload size={16} />}
                  disabled={loading}
                  {...props}
                >
                  Upload file
                </Button>
              )}
            </FileButton>
          </SimpleGrid>
        </div>
        {/* Development only; separate, so it does not mix with the real sources. */}
        {import.meta.env.DEV && (
          <Button
            variant="light"
            fullWidth
            color="grape"
            leftSection={<IconFlask size={16} />}
            onClick={chooseSample}
            disabled={loading}
          >
            Use sample data
          </Button>
        )}
        {!google.signedIn && !spreadsheet && (
          <Text size="sm" c="dimmed">
            Sign in with Google to choose a spreadsheet. Uploading a file or pasting cells works without it.
          </Text>
        )}
        {/* Does not need Google: the cells come from the clipboard. */}
        <PasteArea onPaste={chooseFromPaste} onError={setError} compact={spreadsheet !== null} />
        {spreadsheet && (
          <>
            <Group gap="xs">
              <Text fw={500}>{spreadsheet.title}</Text>
              {sheet && loaded?.source.canReload && (
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="gray"
                  leftSection={<IconRefresh size={14} />}
                  loading={loading}
                  onClick={() => loaded && withLoading(() => loadSheet(loaded, sheet))}
                >
                  Reload
                </Button>
              )}
            </Group>
            {/* With a single sheet there is nothing to choose. */}
            {spreadsheet.sheets.length > 1 && (
              <Select
                label="Sheet"
                data={spreadsheet.sheets}
                value={sheet}
                allowDeselect={false}
                disabled={loading}
                onChange={(name) => name && loaded && withLoading(() => loadSheet(loaded, name))}
              />
            )}
          </>
        )}
        {/* Per sheet: shown when a sheet is loaded. */}
        {currentKey && (
          <Checkbox
            label="First row is a header"
            description="Use the first row as variable names. Otherwise variables are the column letters: {{ A }}, {{ B }}..."
            checked={hasHeader}
            onChange={(event) => changeHasHeader(event.currentTarget.checked)}
          />
        )}
        {hasData && <NormalizedData />}
        {error && (
          <Notice tone="error" title="Could not load the spreadsheet">
            {error}
          </Notice>
        )}
      </Stack>
    </Card>
  )
}
