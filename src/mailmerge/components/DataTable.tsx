import { Badge, Checkbox, Group, Stack, Table, Text } from '@mantine/core'
import { useRef } from 'react'
import { rangeBetween, setIncluded } from '../merge/exclusion.ts'
import { STEP_LABELS, type Normalization, type NormalizedDataset, type Step } from '../merge/normalize.ts'
import { ColumnSteps } from './ColumnSteps.tsx'

interface Props {
  dataset: NormalizedDataset
  normalization: Normalization
  showOriginal: boolean
  onColumnStepsChange: (key: string, steps: Step[]) => void
  /** Filas que no se envían (por índice). */
  excluded: Set<number>
  onExcludedChange: (excluded: Set<number>) => void
}

/** Contenido de la hoja (ya normalizado); el # coincide con el de la vista previa. */
export function DataTable({ dataset, normalization, showOriginal, onColumnStepsChange, excluded, onExcludedChange }: Props) {
  const rows = showOriginal ? dataset.original : dataset.rows
  // Última fila marcada o desmarcada, para Shift+clic por rango (como en Gmail).
  const lastClicked = useRef<number | null>(null)

  function toggleRow(index: number, include: boolean, range: boolean) {
    const order = rows.map((_, i) => i)
    onExcludedChange(setIncluded(excluded, range ? rangeBetween(order, lastClicked.current, index) : [index], include))
    lastClicked.current = index
  }

  const includedCount = rows.length - excluded.size
  // En estado intermedio, un clic incluye todas las filas.
  const toggleAll = () => onExcludedChange(includedCount === rows.length ? new Set(rows.map((_, i) => i)) : new Set())
  return (
    <Table.ScrollContainer minWidth={dataset.columns.length * 140} maxHeight={360} type="native">
      <Table stickyHeader striped highlightOnHover withTableBorder withColumnBorders fz="xs" verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={32}>
              <Checkbox
                size="xs"
                aria-label="Include all rows"
                checked={rows.length > 0 && includedCount === rows.length}
                indeterminate={includedCount > 0 && includedCount < rows.length}
                onChange={toggleAll}
              />
            </Table.Th>
            <Table.Th>#</Table.Th>
            {dataset.columns.map(({ key }) => {
              const steps = normalization.columns[key] ?? []
              return (
                <Table.Th key={key} style={{ verticalAlign: 'top' }}>
                  <Stack gap={4}>
                    <Group gap={4} justify="space-between" wrap="nowrap">
                      <Text size="xs" fw={600} ff="monospace">
                        {key}
                      </Text>
                      <ColumnSteps
                        columnKey={key}
                        steps={steps}
                        onChange={(next) => onColumnStepsChange(key, next)}
                      />
                    </Group>
                    {steps.length > 0 && (
                      <Group gap={4}>
                        {steps.map((step, i) => (
                          <Badge key={i} size="xs" variant="light" radius="sm" tt="none">
                            {STEP_LABELS[step.type].replace('…', '')}
                          </Badge>
                        ))}
                      </Group>
                    )}
                  </Stack>
                </Table.Th>
              )
            })}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, index) => (
            // Las filas excluidas se atenúan: siguen visibles para poder volver a incluirlas.
            <Table.Tr key={index} style={excluded.has(index) ? { opacity: 0.45 } : undefined}>
              <Table.Td>
                <Checkbox
                  size="xs"
                  aria-label={`Include row ${index + 1}`}
                  checked={!excluded.has(index)}
                  onChange={(event) =>
                    toggleRow(index, event.currentTarget.checked, (event.nativeEvent as MouseEvent).shiftKey)
                  }
                />
              </Table.Td>
              <Table.Td c="dimmed">{index + 1}</Table.Td>
              {dataset.columns.map(({ key }) => {
                const original = dataset.original[index][key]
                const changed = !showOriginal && dataset.rows[index][key] !== original
                return (
                  <Table.Td
                    key={key}
                    title={changed ? `Original: "${original}"` : undefined}
                    bg={changed ? 'var(--mantine-color-yellow-light)' : undefined}
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {row[key]}
                  </Table.Td>
                )
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
