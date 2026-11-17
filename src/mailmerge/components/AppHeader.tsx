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
import { IconCheck, IconListCheck, IconLogout, IconPencil } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { useGoogle } from '../google/index.ts'
import { useStore } from '../store.ts'
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

/** Dos líneas que convergen en un sobre: varias filas → un correo cada una. */
function MergeMark() {
  return (
    <svg className={classes.mark} width="30" height="24" viewBox="0 0 30 24" fill="none" aria-hidden>
      <path d="M1 5c5 0 6 7 11 7M1 19c5 0 6-7 11-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="13" y="5" width="16" height="14" rx="2" fill="currentColor" />
      <path
        d="M14.5 7l6.5 5 6.5-5"
        stroke="var(--mantine-color-body)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

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

export type View = 'edit' | 'review'

/** Ítems de tema para un Menu: en el teléfono el selector no cabe en el encabezado. */
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

/** Conteo de correos con problemas, en línea con la etiqueta de Review. */
function ReviewLabel() {
  // Solo el contador lee del store: cuando cambia, no se re-dibuja el encabezado entero.
  const problemCount = useStore((state) => state.problemCount)
  return (
    <span className={classes.viewLabel}>
      Review
      {problemCount > 0 && (
        <span className={classes.viewCounter} title={`${problemCount} emails need fixing`}>
          {problemCount}
        </span>
      )}
    </span>
  )
}

interface Props {
  view: View
  onViewChange: (view: View) => void
}

export function AppHeader({ view, onViewChange }: Props) {
  const google = useGoogle()
  // Mantine guarda la elección en localStorage.
  const { colorScheme, setColorScheme } = useMantineColorScheme()

  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap">
      <div className={classes.wordmark} style={{ flex: 'none' }}>
        <MergeMark />
        <span className={classes.title}>Mail Merge</span>
      </div>

      {/* Segmentos de igual ancho; el conteo va en línea (como el Counter de GitHub), sin cambiar el ancho. */}
      <SegmentedControl
        visibleFrom="sm"
        aria-label="View"
        classNames={{ control: classes.viewControl }}
        value={view}
        onChange={(value) => onViewChange(value as View)}
        data={[
          { value: 'edit', label: 'Edit' },
          { value: 'review', label: <ReviewLabel /> },
        ]}
      />

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
                {/* En el teléfono basta "Sign in": el logo de Google ya dice con qué cuenta. */}
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

/**
 * Barra inferior del teléfono: Edit y Review quedan al alcance del pulgar,
 * en vez de apretados en el encabezado.
 */
export function BottomNav({ view, onViewChange }: Props) {
  const tabs: { value: View; label: ReactNode; icon: ReactNode }[] = [
    { value: 'edit', label: 'Edit', icon: <IconPencil size={22} stroke={1.75} /> },
    {
      value: 'review',
      label: <ReviewLabel />,
      icon: <IconListCheck size={22} stroke={1.75} />,
    },
  ]
  return (
    <nav className={classes.bottomNav} aria-label="View">
      {tabs.map((tab) => (
        <UnstyledButton
          key={tab.value}
          className={classes.bottomTab}
          aria-current={view === tab.value ? 'page' : undefined}
          data-active={view === tab.value || undefined}
          onClick={() => onViewChange(tab.value)}
        >
          <span className={classes.bottomIcon}>{tab.icon}</span>
          <span className={classes.bottomLabel}>{tab.label}</span>
        </UnstyledButton>
      ))}
    </nav>
  )
}
