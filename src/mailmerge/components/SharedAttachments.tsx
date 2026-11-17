import { ActionIcon, Button, Group, Loader as Spinner, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { useFileDialog } from '@mantine/hooks'
import {
  IconFile,
  IconFiles,
  IconFileZip,
  IconFlask,
  IconFolder,
  IconRefresh,
  IconUpload,
  IconX,
} from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { newAttachmentId, type SharedAttachment } from '../attachments/model.ts'
import { MAX_ATTACHMENTS_SIZE } from '../attachments/resolve.ts'
import { fileNode, formatSize } from '../attachments/tree.ts'
import { useGoogle } from '../google/index.ts'
import { plural } from '../mail/sending.ts'
import { isDriveOrigin } from '../sources.ts'
import { updateShared, useStore } from '../store.ts'
import { HelpPopover, HelpSection } from './HelpPopover.tsx'
import { Notice } from './Notice.tsx'
import classes from './AttachmentsPanel.module.css'
import { SortableList } from './SortableList.tsx'
import { LoadStatus } from './LoadStatus.tsx'
import { useFileDrop, useLoader, type Dropped } from './useLoader.ts'

const update = (id: string, patch: Partial<SharedAttachment>, typing = false) =>
  updateShared((shared) => shared.map((item) => (item.id === id ? { ...item, ...patch } : item)), { typing })

const remove = (id: string) => updateShared((shared) => shared.filter((item) => item.id !== id))

/** Lee archivos del computador; rechaza los vacíos y los que solos superan el límite de Gmail. */
async function readUploads(files: File[]): Promise<{ added: SharedAttachment[]; errors: string[] }> {
  const added: SharedAttachment[] = []
  const errors: string[] = []
  for (const file of files) {
    if (file.size === 0) errors.push(`${file.name}: the file is empty.`)
    else if (file.size > MAX_ATTACHMENTS_SIZE)
      errors.push(`${file.name}: ${formatSize(file.size)}; Gmail allows up to 25 MB per email.`)
    else {
      try {
        const data = new Uint8Array(await file.arrayBuffer())
        added.push({ id: newAttachmentId(), origin: { kind: 'upload' }, file: fileNode(file.name, data, file.type), name: '' })
      } catch (e) {
        errors.push(`${file.name}: ${(e as Error).message}`)
      }
    }
  }
  return { added, errors }
}

function SharedRow({ item, handle }: { item: SharedAttachment; handle: ReactNode }) {
  const google = useGoogle()
  const loader = useLoader()
  const { file, origin } = item
  const zip = file.mimeType === 'application/zip'
  const reload = () =>
    isDriveOrigin(origin) &&
    loader.run(`Reloading ${file.filename}…`, async (onProgress) => {
      const next = await google.drive.loadFile(origin, onProgress)
      update(item.id, { file: next })
    })

  return (
    <Stack gap={4} className={classes.sharedRow}>
      <Group gap={6} wrap="nowrap">
        {handle}
        <span className={classes.fileIcon}>{zip ? <IconFileZip size={16} /> : <IconFile size={16} />}</span>
        <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }} title={file.filename}>
          {file.filename}
        </Text>
        <Text size="xs" c="dimmed" style={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
          {formatSize(file.size)}
        </Text>
        {isDriveOrigin(origin) && (
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`Reload ${file.filename} from Google Drive`}
            title="Reload from Google Drive"
            disabled={!google.signedIn || !!loader.progress}
            onClick={reload}
          >
            {loader.progress ? <Spinner size={14} /> : <IconRefresh size={16} />}
          </ActionIcon>
        )}
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={`Remove ${file.filename}`}
          title="Remove"
          onClick={() => remove(item.id)}
        >
          <IconX size={16} />
        </ActionIcon>
      </Group>
      <TextInput
        size="xs"
        ff="monospace"
        className={classes.indented}
        placeholder="Attachment name (optional)"
        aria-label={`Attachment name for ${file.filename}`}
        value={item.name}
        onChange={(event) => update(item.id, { name: event.currentTarget.value }, true)}
      />
      {loader.error && (
        <Text size="xs" c="red" className={classes.indented}>
          Could not reload: {loader.error}
        </Text>
      )}
    </Stack>
  )
}

/** Archivos que van en todos los correos, antes de los de cada fila. */
export function SharedAttachments() {
  const shared = useStore((state) => state.shared)
  const google = useGoogle()
  const loader = useLoader()
  const busy = !!loader.progress

  const add = (items: SharedAttachment[]) => updateShared((current) => [...current, ...items])

  async function fromUpload({ files, folders }: Dropped) {
    const folderErrors = folders.map((name) => `${name}: folders can't be added. Compress it first, or use "Drive folder".`)
    if (files.length === 0) return loader.fail(folderErrors.join('\n') || null)
    await loader.run(files.length === 1 ? `Reading ${files[0].name}…` : `Reading ${files.length} files…`, async () => {
      const { added, errors } = await readUploads(files)
      add(added)
      const all = [...folderErrors, ...errors]
      if (all.length > 0) throw new Error(all.join('\n'))
    })
  }

  const dialog = useFileDialog({
    multiple: true,
    resetOnOpen: true,
    onChange: (files) => files && fromUpload({ files: [...files], folders: [] }),
  })
  const drop = useFileDrop(fromUpload, busy)

  const fromDriveFiles = () =>
    loader.run('Opening Google Drive…', async (onProgress) => {
      const picked = await google.drive.pickFiles()
      if (!picked) return
      const added: SharedAttachment[] = []
      const errors: string[] = []
      for (const origin of picked) {
        try {
          const file = await google.drive.loadFile(origin, onProgress)
          added.push({ id: newAttachmentId(), origin, file, name: '' })
        } catch (e) {
          errors.push(`${origin.name}: ${(e as Error).message}`)
        }
      }
      add(added)
      if (errors.length > 0) throw new Error(errors.join('\n'))
    })

  const fromDriveFolder = () =>
    loader.run('Opening Google Drive…', async (onProgress) => {
      const origin = await google.drive.pickFolder()
      if (!origin) return
      const file = await google.drive.loadFile(origin, onProgress)
      add([{ id: newAttachmentId(), origin, file, name: '' }])
    })

  const fromSample = () =>
    loader.run('Loading sample…', async () => {
      const { sampleSharedFile } = await import('../sample/index.ts')
      add([{ id: newAttachmentId(), origin: { kind: 'sample' }, file: sampleSharedFile(), name: '' }])
    })

  const total = shared.reduce((sum, item) => sum + item.file.size, 0)

  return (
    <Stack gap={6} {...drop.props} className={classes.dropZone} data-active={drop.active || undefined}>
      <Group gap={4}>
        <Text size="sm" fw={500}>
          Attached to every email
        </Text>
        <HelpPopover label="Help for attachments sent to every email" iconOnly>
          <HelpSection title="Every email">
            <Text size="xs" c="dimmed">
              Each file here is attached to every email, before the files for each row. A Drive folder is attached as
              one ZIP. Drag the handle to change the order.
            </Text>
          </HelpSection>
          <HelpSection title="Name">
            <Text size="xs" c="dimmed">
              Optional, and can use variables: <code>{'Reglamento {{ nombre }}'}</code>. A missing extension is added.
            </Text>
          </HelpSection>
        </HelpPopover>
      </Group>

      <div style={{ containerType: 'inline-size' }}>
        <SimpleGrid type="container" cols={{ base: 1, '500px': 3 }} spacing="xs">
          <Button
            variant="default"
            fullWidth
            leftSection={<IconFolder size={16} />}
            disabled={!google.signedIn || busy}
            onClick={fromDriveFolder}
          >
            Drive folder
          </Button>
          <Button
            variant="default"
            fullWidth
            leftSection={<IconFiles size={16} />}
            disabled={!google.signedIn || busy}
            onClick={fromDriveFiles}
          >
            Drive files
          </Button>
          <Button variant="default" fullWidth leftSection={<IconUpload size={16} />} disabled={busy} onClick={dialog.open}>
            Upload files
          </Button>
        </SimpleGrid>
      </div>
      {/* Solo en desarrollo; aparte, para no mezclarlo con las fuentes reales. */}
      {import.meta.env.DEV && (
        <Button variant="light" fullWidth color="grape" leftSection={<IconFlask size={16} />} disabled={busy} onClick={fromSample}>
          Use sample file
        </Button>
      )}
      {shared.length === 0 && (
        <Text size="xs" c="dimmed">
          The same files for everyone. You can also drop files here.
        </Text>
      )}

      <LoadStatus loader={loader} title="Could not add the files" />

      {shared.length > 0 && (
        <>
          <SortableList
            items={shared}
            getId={(item) => item.id}
            getLabel={(item) => item.file.filename}
            onReorder={(items) => updateShared(() => items)}
          >
            {(item, handle) => <SharedRow item={item} handle={handle} />}
          </SortableList>
          <Text size="xs" c="dimmed">
            {plural(shared.length, 'file', 'files')} · {formatSize(total)}, attached to every email
          </Text>
          {total > MAX_ATTACHMENTS_SIZE && (
            <Notice tone="warning" title="Too large">
              These files add up to {formatSize(total)}; Gmail allows up to 25 MB per email.
            </Notice>
          )}
        </>
      )}
    </Stack>
  )
}
