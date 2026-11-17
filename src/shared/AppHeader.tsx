import {
  ActionIcon,
  Avatar,
  Box,
  Group,
  Loader,
  Menu,
  SegmentedControl,
  Text,
  Tooltip,
  UnstyledButton,
  useMantineColorScheme,
  type MantineColorScheme,
} from '@mantine/core'
import { IconCheck, IconChevronDown, IconLayoutGrid, IconLogout } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { APPS, type AppInfo } from '../apps.ts'
import { useGoogleSession } from './google/index.ts'
import { Link } from './Link.tsx'
import { usePath } from './router.ts'
import classes from './AppHeader.module.css'

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

const COLOR_SCHEMES: { value: MantineColorScheme; label: string; icon: ReactNode }[] = [
  {
    value: 'light',
    label: 'Light theme',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark theme',
    icon: (
      <svg {...iconProps}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
    ),
  },
  {
    value: 'auto',
    label: 'Match system theme',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
]

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

/** Theme items for a Menu: on a phone the selector does not fit in the header. */
function ThemeMenuItems() {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  return (
    <>
      <Menu.Label>Theme</Menu.Label>
      {COLOR_SCHEMES.map(({ value, label, icon }) => (
        <Menu.Item
          key={value}
          leftSection={icon}
          rightSection={colorScheme === value ? <IconCheck size={14} /> : null}
          aria-checked={colorScheme === value}
          role="menuitemradio"
          onClick={() => setColorScheme(value)}
        >
          {label.replace(' theme', '')}
        </Menu.Item>
      ))}
    </>
  )
}

/** Name of the current app; opens a menu to move to another app or to the landing page. */
function AppSwitcher({ app }: { app?: AppInfo }) {
  const Icon = app?.icon ?? IconLayoutGrid
  return (
    <Menu position="bottom-start" width={220} withinPortal>
      <Menu.Target>
        <UnstyledButton className={classes.wordmark} aria-label="Switch app">
          <span className={classes.mark}>
            <Icon size={24} />
          </span>
          <span className={classes.title}>{app?.name ?? 'OCI Tools'}</span>
          <IconChevronDown size={16} className={classes.chevron} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} to="" leftSection={<IconLayoutGrid size={18} />}>
          All tools
        </Menu.Item>
        <Menu.Divider />
        {APPS.map(({ path, name, icon: AppIcon }) => (
          <Menu.Item
            key={path}
            component={Link}
            to={path}
            leftSection={<AppIcon size={18} />}
            rightSection={app?.path === path ? <IconCheck size={14} /> : null}
            aria-current={app?.path === path ? 'page' : undefined}
          >
            {name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}

interface Props {
  /** App-specific controls, shown in the middle. */
  children?: ReactNode
}

/** Header shared by every page: app switcher, the app's own controls, theme and Google account. */
export function AppHeader({ children }: Props) {
  // The current app comes from the URL; none on the landing page.
  const [first] = usePath().split('/')
  const app = APPS.find(({ path }) => path === first)
  const google = useGoogleSession()
  // Mantine stores the choice in localStorage.
  const { colorScheme, setColorScheme } = useMantineColorScheme()

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      <div style={{ flex: 'none' }}>
        <AppSwitcher app={app} />
      </div>

      {children}

      <Group gap="sm" wrap="nowrap">
        <SegmentedControl
          visibleFrom="sm"
          size="xs"
          radius="xl"
          aria-label="Color theme"
          value={colorScheme}
          onChange={(value) => setColorScheme(value as MantineColorScheme)}
          data={COLOR_SCHEMES.map(({ value, label, icon }) => ({
            value,
            label: (
              <Tooltip label={label} openDelay={400}>
                <span style={{ display: 'flex' }} aria-label={label}>
                  {icon}
                </span>
              </Tooltip>
            ),
          }))}
        />

        {google.signedIn ? (
          <Menu position="bottom-end" width={240} withinPortal>
            <Menu.Target>
              <UnstyledButton className={classes.account} aria-label={`Account: ${google.email ?? ''}`}>
                <Avatar name={google.email ?? undefined} color="initials" size={34} />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Signed in as</Menu.Label>
              <Text size="sm" px="sm" pb="xs" truncate>
                {google.email}
              </Text>
              <Box hiddenFrom="sm">
                <Menu.Divider />
                <ThemeMenuItems />
              </Box>
              <Menu.Divider />
              <Menu.Item leftSection={<IconLogout size={16} />} onClick={google.signOut}>
                Sign out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ) : (
          <>
            <Menu position="bottom-end" width={200} withinPortal>
              <Menu.Target>
                <ActionIcon hiddenFrom="sm" variant="default" radius="xl" size={36} aria-label="Color theme">
                  {COLOR_SCHEMES.find((scheme) => scheme.value === colorScheme)?.icon}
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <ThemeMenuItems />
              </Menu.Dropdown>
            </Menu>
            <UnstyledButton
              className={classes.google}
              onClick={google.signIn}
              disabled={google.connecting}
              data-disabled={google.connecting || undefined}
            >
              <Group gap={10} wrap="nowrap">
                {google.connecting ? <Loader size={16} /> : <GoogleLogo />}
                {/* On a phone "Sign in" is enough: the Google logo already says which account. */}
                <Box component="span" visibleFrom="sm">
                  Sign in with Google
                </Box>
                <Box component="span" hiddenFrom="sm">
                  Sign in
                </Box>
              </Group>
            </UnstyledButton>
          </>
        )}
      </Group>
    </Group>
  )
}
