import { Center, Loader } from '@mantine/core'
import { Suspense, useEffect } from 'react'
import { APPS, type AppInfo } from './apps.ts'
import { Landing } from './landing/Landing.tsx'
import { LoadErrorBoundary } from './shared/LoadErrorBoundary.tsx'
import { navigate, usePath } from './shared/router.ts'

const SITE_NAME = 'OCI Tools'
/** Tab title of the current app. Every app uses the site's favicon (index.html). */
function useDocumentTitle(app: AppInfo | undefined) {
  useEffect(() => {
    document.title = app ? app.name : SITE_NAME
  }, [app])
}

export function Root() {
  const path = usePath()
  const [first, ...rest] = path.split('/')
  const app = APPS.find((candidate) => candidate.path === first)
  useDocumentTitle(app)

  // Unknown routes (served by 404.html) go back to the landing page.
  const unknown = !app && path !== ''
  useEffect(() => {
    if (unknown) navigate('', { replace: true })
  }, [unknown])

  if (!app) return <Landing />
  const App = app.component
  return (
    <LoadErrorBoundary key={app.path}>
      <Suspense
        fallback={
          <Center h="100vh">
            <Loader />
          </Center>
        }
      >
        {/* Only the current app is mounted; each keeps its data in its own module-level store. */}
        <App subpath={rest.join('/')} />
      </Suspense>
    </LoadErrorBoundary>
  )
}
