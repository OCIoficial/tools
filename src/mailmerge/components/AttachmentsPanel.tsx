import { Card, Divider, Stack, Title } from '@mantine/core'
import { PathSources } from './PathSources.tsx'
import { SharedAttachments } from './SharedAttachments.tsx'

/**
 * Two separate sections, with no ambiguity about what a file does: the ones that go in every
 * email, and the folders or archives from which each row takes its own with paths.
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
