import { Alert, Button, Center, Stack, Text } from '@mantine/core'
import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Shown when an app fails to load or crashes, instead of a blank page. A common cause is a new
 * deploy while the page was open: the old code chunks no longer exist and a reload fixes it.
 */
export class LoadErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Center h="100vh" p="md">
        <Alert color="red" title="Something went wrong" maw={480}>
          <Stack gap="sm" align="flex-start">
            <Text size="sm">{this.state.error.message}</Text>
            <Button size="xs" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
          </Stack>
        </Alert>
      </Center>
    )
  }
}
