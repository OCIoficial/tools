import { Center, Loader } from '@mantine/core'
import { Suspense, useEffect } from 'react'
import { APPS, type AppInfo } from './apps.ts'
import { Landing } from './landing/Landing.tsx'
import { LoadErrorBoundary } from './shared/LoadErrorBoundary.tsx'
import { BASE, navigate, usePath } from './shared/router.ts'

const SITE_NAME = 'OCI Tools'
const SITE_FAVICON = { href: `${BASE}favicon.png`, type: 'image/png' }

/** Tab title and icon of the current app. */
function useDocumentMeta(app: AppInfo | undefined) {
  useEffect(() => {
    document.title = app ? app.name : SITE_NAME
    const { href, type } = app?.favicon ?? SITE_FAVICON
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = href
    link.type = type
  }, [app])
}

export function Root() {
  const path = usePath()
  const [first, ...rest] = path.split('/')
  const app = APPS.find((candidate) => candidate.path === first)
  useDocumentMeta(app)

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
