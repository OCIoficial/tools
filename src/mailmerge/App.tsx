import '@mantine/tiptap/styles.css'

import { AppShell, Grid, Stack } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import type { AppProps } from '../apps.ts'
import { AppHeader } from '../shared/AppHeader.tsx'
import { missingConfig } from '../shared/google/index.ts'
import { navigate } from '../shared/router.ts'
import { AttachmentsPanel } from './components/AttachmentsPanel.tsx'
import { Notice } from './components/Notice.tsx'
import { ReviewView } from './components/ReviewView.tsx'
import { SendBar, SendConfirmModal } from './components/SendPanel.tsx'
import { SpreadsheetPanel } from './components/SpreadsheetPanel.tsx'
import { TemplateEditor } from './components/TemplateEditor.tsx'
import { BottomNav, ViewControl, type View } from './components/ViewNav.tsx'
import { GoogleProvider, useGoogle } from './google/index.ts'
import { warnWhileSending } from './mail/sending.ts'
import { useIsMobile } from './media.ts'
import { useSending, useStore } from './store.ts'

warnWhileSending()

/** Mail Merge's own access to Google, on top of the shared sign-in. */
export default function MailMerge(props: AppProps) {
  return (
    <GoogleProvider>
      <App {...props} />
    </GoogleProvider>
  )
}

/**
 * Only the page structure. It does not read the template or the emails: if it did, it would
 * re-render on every keystroke and drag every panel along. Each panel reads from the store.
 */
function App({ subpath }: AppProps) {
  const google = useGoogle()
  const mobile = useIsMobile()
  // The view lives in the URL (mailmerge/review), so reloading keeps the user where they were
  // and the Back button moves between views.
  const view: View = subpath === 'review' ? 'review' : 'edit'
  const changeView = (next: View) => {
    if (next === view) return
    navigate(next === 'review' ? 'mailmerge/review' : 'mailmerge')
    // Each view starts at the top; otherwise Review inherits Edit's scroll.
    window.scrollTo({ top: 0 })
  }
  const datasetVersion = useStore((state) => state.datasetVersion)
  const hasEmails = useStore((state) => state.allEmails.length > 0)
  const sending = useSending()

  // On a phone, Review pins Test and Send above the tabs; the footer grows with the bar.
  const showSendBar = mobile && view === 'review' && hasEmails
  const { ref: sendBarRef, height: sendBarHeight } = useElementSize()
  const footerHeight = 64 + (showSendBar ? Math.ceil(sendBarHeight) : 0)

  return (
    // On a phone, Edit and Review move from the header to a bottom bar.
    <AppShell header={{ height: 60 }} footer={{ height: footerHeight, collapsed: !mobile }} padding="md">
      <AppShell.Header>
        <AppHeader>
          <ViewControl view={view} onViewChange={changeView} />
        </AppHeader>
      </AppShell.Header>
      <AppShell.Main>
        <Stack gap="md">
          {missingConfig.length > 0 && (
            <Notice tone="warning" title="Incomplete configuration">
              Missing environment variables: {missingConfig.join(', ')}. See <code>.env.example</code>.
            </Notice>
          )}
          {google.error && (
            <Notice tone="error" title="Could not sign in with Google">
              {google.error}
            </Notice>
          )}
          {/* Edit is hidden instead of unmounted, to keep the state of its panels. */}
          <div hidden={view !== 'edit'}>
            {sending && (
              <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
                <Notice tone="warning" title="Sending in progress">
                  Editing is locked until sending finishes or you stop it, so the emails sent are the ones shown
                  in Review.
                </Notice>
              </div>
            )}
            {/* While sending, a disabled fieldset locks every field and button in Edit;
                the text editors and the file drop zones are locked separately. The store
                guarantees it anyway (see isSending). */}
            <fieldset disabled={sending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              {/* The columns stretch to the same height, so the bottoms of Spreadsheet and Attachments line up. */}
              <Grid gap="md">
                <Grid.Col span={{ base: 12, md: 7 }}>
                  <SpreadsheetPanel />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 5 }}>
                  <Stack gap="md" h="100%">
                    <TemplateEditor />
                    <div style={{ flex: 1 }}>
                      <AttachmentsPanel />
                    </div>
                  </Stack>
                </Grid.Col>
              </Grid>
            </fieldset>
          </div>
          {/* key: a new spreadsheet resets Review's selection and filters. */}
          {view === 'review' && <ReviewView key={datasetVersion} />}
        </Stack>
      </AppShell.Main>
      {mobile && (
        <AppShell.Footer>
          {showSendBar && (
            <div ref={sendBarRef}>
              <SendBar />
            </div>
          )}
          <BottomNav view={view} onViewChange={changeView} />
        </AppShell.Footer>
      )}
      <SendConfirmModal />
    </AppShell>
  )
}

