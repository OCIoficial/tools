import { ActionIcon, Button, Popover, Stack, Text } from '@mantine/core'
import { IconHelpCircle } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import classes from './HelpPopover.module.css'

interface Props {
  /** Texto del botón; si `iconOnly`, queda como nombre accesible. */
  label: string
  iconOnly?: boolean
  children: ReactNode
}

/**
 * Ayuda de referencia a pedido: se abre con clic o toque (no hover, que no existe en
 * el teléfono), se cierra con Esc o tocando fuera.
 */
export function HelpPopover({ label, iconOnly = false, children }: Props) {
  return (
    <Popover position="top-start" withArrow shadow="md" width={340} trapFocus returnFocus>
      <Popover.Target>
        {iconOnly ? (
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label={label}>
            <IconHelpCircle size={16} />
          </ActionIcon>
        ) : (
          <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconHelpCircle size={14} />}>
            {label}
          </Button>
        )}
      </Popover.Target>
      <Popover.Dropdown className={classes.dropdown} aria-label={label}>
        <Stack gap="sm">{children}</Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

/** Sección con título y filas ejemplo → explicación. */
export function HelpSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={4}>
        {title}
      </Text>
      {children}
    </div>
  )
}

export function HelpRows({ rows }: { rows: [example: string, meaning: ReactNode][] }) {
  return (
    <dl className={classes.rows}>
      {rows.map(([example, meaning]) => (
        <div key={example}>
          <dt>
            <code>{example}</code>
          </dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
  )
}
