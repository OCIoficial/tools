import { ActionIcon, Button, Checkbox, Group, Loader as Spinner, Menu, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { useFileDialog } from '@mantine/hooks'
import {
  IconArrowsExchange,
  IconFileZip,
  IconFlask,
  IconFolder,
  IconPlus,
  IconRefresh,
  IconUpload,
  IconX,
} from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { readArchive } from '../attachments/archive.ts'
import { newAttachmentId, type AttachmentPath, type PathSource } from '../attachments/model.ts'
import type { AttachmentTree } from '../attachments/tree.ts'
import { useGoogle, type Drive } from '../google/index.ts'
import { isDriveOrigin, type LoadProgress, type Origin } from '../sources.ts'
import { updateSources, useStore } from '../store.ts'
import classes from './AttachmentsPanel.module.css'
import { FileTree } from './FileTree.tsx'
import { HelpPopover, HelpRows, HelpSection } from './HelpPopover.tsx'
import { SortableList } from './SortableList.tsx'
import { LoadStatus } from './LoadStatus.tsx'
import { useFileDrop, useLoader, type Dropped, type Loader } from './useLoader.ts'

const ARCHIVE_ACCEPT = '.zip,.tar,.tgz,.gz,application/zip,application/x-tar,application/gzip'

type Loaded = { origin: Origin; tree: AttachmentTree }
type OnProgress = (progress: LoadProgress) => void

const updateSource = (id: string, patch: Partial<PathSource>, typing = false) =>
  updateSources((sources) => sources.map((source) => (source.id === id ? { ...source, ...patch } : source)), {
    typing,
  })

/** Lee archivos comprimidos del computador; los que fallan se informan juntos al final. */
async function readUploads({ files, folders }: Dropped, onProgress: OnProgress): Promise<Loaded[]> {
  const loaded: Loaded[] = []
  const errors = folders.map((name) => `${name}: folders can't be added. Compress it first, or use "Drive folder".`)
  for (const file of files) {
    onProgress({ message: `Reading ${file.name}…` })
    try {
      loaded.push({ origin: { kind: 'upload' }, tree: await readArchive(file.name, new Uint8Array(await file.arrayBuffer())) })
    } catch (e) {
      errors.push(`${file.name}: ${(e as Error).message}`)
    }
  }
  if (errors.length > 0) {
    // Lo que sí se leyó se agrega igual; el error se muestra después.
    throw Object.assign(new Error(errors.join('\n')), { loaded })
  }
  return loaded
}

/** Ejecuta una carga que puede terminar con parte de lo pedido y un error. */
async function withPartial(task: () => Promise<Loaded[]>, apply: (loaded: Loaded[]) => void) {
  try {
    apply(await task())
  } catch (e) {
    const loaded = (e as { loaded?: Loaded[] }).loaded
    if (loaded) apply(loaded)
    throw e
  }
}

/** Elegir en Drive y cargar como árbol. */
async function fromDrive(drive: Drive, kind: 'folder' | 'archive', onProgress: OnProgress): Promise<Loaded | null> {
  const origin = kind === 'folder' ? await drive.pickFolder() : await drive.pickArchive()
  return origin && { origin, tree: await drive.loadTree(origin, onProgress) }
}

/** Los tres botones para agregar o reemplazar una fuente. */
function useSourcePickers(loader: Loader, onLoaded: (loaded: Loaded[]) => void, multiple: boolean) {
  const google = useGoogle()
  const fromUpload = (dropped: Dropped) =>
    loader.run(
      dropped.files.length === 1 ? `Reading ${dropped.files[0].name}…` : 'Reading archives…',
      (onProgress) => withPartial(() => readUploads(dropped, onProgress), onLoaded),
    )
  const dialog = useFileDialog({
    multiple,
    accept: ARCHIVE_ACCEPT,
    resetOnOpen: true,
    onChange: (files) => files && files.length > 0 && fromUpload({ files: [...files], folders: [] }),
  })
  const pickDrive = (kind: 'folder' | 'archive') =>
    loader.run('Opening Google Drive…', async (onProgress) => {
      const loaded = await fromDrive(google.drive, kind, onProgress)
      if (loaded) onLoaded([loaded])
    })
  return { fromUpload, openUpload: dialog.open, pickDrive, canUseDrive: google.signedIn }
}

function PathRow({ source, index }: { source: PathSource; index: number }) {
  const { path, name, required } = source.paths[index]
  const updatePath = (patch: Partial<AttachmentPath>) =>
    updateSource(source.id, { paths: source.paths.map((p, i) => (i === index ? { ...p, ...patch } : p)) }, true)
  return (
    // Una ruta = un adjunto: la ruta, y debajo su nombre y si es obligatorio.
    <Stack gap={4} className={classes.path}>
      <Group gap={8} wrap="nowrap">
        <TextInput
          style={{ flex: 1 }}
          ff="monospace"
          placeholder="Alumnos/{{ rut }}/*.pdf"
          aria-label={`Path ${index + 1} in ${source.tree.name}`}
          value={path}
          onChange={(event) => updatePath({ path: event.currentTarget.value })}
        />
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={`Remove path ${index + 1} in ${source.tree.name}`}
          onClick={() => updateSource(source.id, { paths: source.paths.filter((_, i) => i !== index) })}
        >
          <IconX size={16} />
        </ActionIcon>
      </Group>
      <Group gap={8} wrap="nowrap">
        <TextInput
          size="xs"
          style={{ flex: 1 }}
          ff="monospace"
          placeholder="Attachment name (optional)"
          aria-label={`Attachment name for path ${index + 1} in ${source.tree.name}`}
          value={name}
          onChange={(event) => updatePath({ name: event.currentTarget.value })}
        />
        <Checkbox
          size="xs"
          label="Required"
          title={
            required
              ? 'If nothing matches, the email is marked as needing fixing.'
              : 'If nothing matches, the email is sent without it.'
          }
          checked={required}
          onChange={(event) => updatePath({ required: event.currentTarget.checked })}
        />
        {/* Alinea con la ✕ de la fila de arriba. */}
        <div style={{ width: 28, flex: 'none' }} />
      </Group>
    </Stack>
  )
}

function SourceCard({ source, handle }: { source: PathSource; handle: ReactNode }) {
  const google = useGoogle()
  const loader = useLoader()
  const busy = !!loader.progress
  const { origin, tree } = source
  // Reemplazar o recargar conserva las rutas.
  const replace = (loaded: Loaded[]) => loaded[0] && updateSource(source.id, { origin: loaded[0].origin, tree: loaded[0].tree })
  const pickers = useSourcePickers(loader, replace, false)
  const reload = () =>
    isDriveOrigin(origin) &&
    loader.run(`Reloading ${tree.name}…`, async (onProgress) => {
      replace([{ origin, tree: await google.drive.loadTree(origin, onProgress) }])
    })

  const actions = (
    <Group gap={2} wrap="nowrap" style={{ flex: 'none' }}>
      {isDriveOrigin(origin) && (
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={`Reload ${tree.name} from Google Drive`}
          title="Reload from Google Drive"
          disabled={!google.signedIn || busy}
          onClick={reload}
        >
          {busy ? <Spinner size={14} /> : <IconRefresh size={16} />}
        </ActionIcon>
      )}
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" aria-label={`Replace ${tree.name}`} title="Replace, keeping the paths" disabled={busy}>
            <IconArrowsExchange size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Replace, keeping the paths</Menu.Label>
          <Menu.Item leftSection={<IconFolder size={14} />} disabled={!pickers.canUseDrive} onClick={() => pickers.pickDrive('folder')}>
            Drive folder
          </Menu.Item>
          <Menu.Item leftSection={<IconFileZip size={14} />} disabled={!pickers.canUseDrive} onClick={() => pickers.pickDrive('archive')}>
            Drive archive
          </Menu.Item>
          <Menu.Item leftSection={<IconUpload size={14} />} onClick={pickers.openUpload}>
            Upload archive
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label={`Remove ${tree.name} and its paths`}
        title="Remove, with its paths"
        onClick={() => updateSources((sources) => sources.filter((s) => s.id !== source.id))}
      >
        <IconX size={16} />
      </ActionIcon>
    </Group>
  )

  return (
    <FileTree key={tree.root.id} tree={tree} leading={handle} actions={actions}>
      <Stack gap={6}>
        <LoadStatus loader={loader} title={`Could not replace ${tree.name}`} />
        {source.paths.length === 0 && (
          <Text size="xs" c="dimmed">
            No paths yet: nothing from here is attached.
          </Text>
        )}
        {source.paths.map((_, index) => (
          <PathRow key={index} source={source} index={index} />
        ))}
        <Group>
          <Button
            size="compact-sm"
            variant="subtle"
            color="gray"
            leftSection={<IconPlus size={14} />}
            onClick={() => updateSource(source.id, { paths: [...source.paths, { path: '', name: '', required: true }] })}
          >
            Add path
          </Button>
        </Group>
      </Stack>
    </FileTree>
  )
}

/** Carpetas y archivos comprimidos, cada uno con sus rutas: los adjuntos de cada fila. */
export function PathSources() {
  const sources = useStore((state) => state.sources)
  const loader = useLoader()
  const busy = !!loader.progress
  const add = (loaded: Loaded[]) =>
    updateSources((current) => [...current, ...loaded.map(({ origin, tree }) => ({ id: newAttachmentId(), origin, tree, paths: [] }))])
  const pickers = useSourcePickers(loader, add, true)
  const drop = useFileDrop(pickers.fromUpload, busy)

  // Import dinámico dentro de DEV: el ejemplo no queda en el build de producción.
  const fromSample = () =>
    loader.run('Loading sample…', async () => {
      const { sampleFiles } = await import('../sample/index.ts')
      add([{ origin: { kind: 'sample' }, tree: sampleFiles() }])
    })

  return (
    <Stack gap={6} {...drop.props} className={classes.dropZone} data-active={drop.active || undefined}>
      <Group gap={4}>
        <Text size="sm" fw={500}>
          Files for each row
        </Text>
        <HelpPopover label="Attachment path help" iconOnly>
          <HelpSection title="Paths">
            <HelpRows
              rows={[
                ['Alumnos/{{ rut }}/informe.pdf', 'One file per row, using template variables'],
                ['Alumnos/{{ rut }}', 'A folder, as a ZIP'],
                ['Alumnos/{{ rut }}/*.pdf', '* matches any characters in a name'],
                ['Alumnos/**/{{ rut }}.pdf', '** matches any number of folders'],
              ]}
            />
            <Text size="xs" c="dimmed" mt={6}>
              Each path is one attachment: if it matches several files, they go in one ZIP that keeps their folders.
              For several attachments, add several paths. Paths are relative to the folder or archive they're under;
              matching is exact, including case and accents.
            </Text>
          </HelpSection>
          <HelpSection title="Name">
            <Text size="xs" c="dimmed">
              Optional, and can use variables: <code>{'informe-{{ rut }}'}</code>. Without one: the file's name, the
              folder's name, or the name of the folder the files share. A missing extension is added.
            </Text>
          </HelpSection>
          <HelpSection title="Required">
            <Text size="xs" c="dimmed">
              Checked: if nothing matches, the email is marked as needing fixing. Unchecked: the email is sent without
              that attachment.
            </Text>
          </HelpSection>
        </HelpPopover>
      </Group>

      {/* Tres opciones equivalentes: mismo ancho. Se decide por el ancho de la tarjeta, no de la
          pantalla, porque en dos columnas la tarjeta es angosta. */}
      <div style={{ containerType: 'inline-size' }}>
        <SimpleGrid type="container" cols={{ base: 1, '500px': 3 }} spacing="xs">
          <Button
            variant="default"
            fullWidth
            leftSection={<IconFolder size={16} />}
            disabled={!pickers.canUseDrive || busy}
            onClick={() => pickers.pickDrive('folder')}
          >
            Drive folder
          </Button>
          <Button
            variant="default"
            fullWidth
            leftSection={<IconFileZip size={16} />}
            disabled={!pickers.canUseDrive || busy}
            onClick={() => pickers.pickDrive('archive')}
          >
            Drive archive
          </Button>
          <Button variant="default" fullWidth leftSection={<IconUpload size={16} />} disabled={busy} onClick={pickers.openUpload}>
            Upload archive
          </Button>
        </SimpleGrid>
      </div>
      {/* Solo en desarrollo; aparte, para no mezclarlo con las fuentes reales. */}
      {import.meta.env.DEV && (
        <Button variant="light" fullWidth color="grape" leftSection={<IconFlask size={16} />} disabled={busy} onClick={fromSample}>
          Use sample files
        </Button>
      )}
      {sources.length === 0 && (
        <Text size="xs" c="dimmed">
          A Drive folder, or a ZIP, TAR or TAR.GZ archive, with a different file for each row chosen by paths. You can
          also drop archives here.
        </Text>
      )}

      <LoadStatus loader={loader} title="Could not load the files" />

      {sources.length > 0 && (
        <SortableList
          items={sources}
          getId={(source) => source.id}
          getLabel={(source) => source.tree.name}
          onReorder={(items) => updateSources(() => items)}
          gap={12}
        >
          {(source, handle) => <SourceCard source={source} handle={handle} />}
        </SortableList>
      )}
    </Stack>
  )
}
