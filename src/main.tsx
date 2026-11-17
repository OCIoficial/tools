import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'

import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './Root.tsx'
import { GoogleSessionProvider } from './shared/google/index.ts'
import { theme } from './shared/theme.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications />
      <GoogleSessionProvider>
        <Root />
      </GoogleSessionProvider>
    </MantineProvider>
  </StrictMode>,
)
