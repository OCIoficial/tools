import { Card, Divider, Stack, Title } from '@mantine/core'
import { PathSources } from './PathSources.tsx'
import { SharedAttachments } from './SharedAttachments.tsx'

/**
 * Dos secciones separadas, sin ambigüedad sobre qué hace un archivo: los que van en todos los
 * correos, y las carpetas o archivos comprimidos de los que cada fila toma los suyos con rutas.
 */
export function AttachmentsPanel() {
  return (
    <Card withBorder h="100%">
      <Stack gap="sm">
        <Title order={4}>3. Attachments</Title>
        <SharedAttachments />
        <Divider />
        <PathSources />
      </Stack>
    </Card>
  )
}
