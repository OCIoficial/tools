import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ActionIcon, Button, Checkbox, Group, Popover, Select, Stack, Text, TextInput } from '@mantine/core'
import { useReducedMotion } from '@mantine/hooks'
import { IconCheck, IconTrash, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { newStep, replacePatternError, STEP_LABELS, type Step, type StepType } from '../merge/normalize.ts'
import classes from './ColumnSteps.module.css'

const STEP_OPTIONS = (Object.keys(STEP_LABELS) as StepType[]).map((value) => ({ value, label: STEP_LABELS[value] }))

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}

function GripIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden>
      {[3, 8, 13].flatMap((y) => [<circle key={`l${y}`} cx="3.5" cy={y} r="1.5" />, <circle key={`r${y}`} cx="8.5" cy={y} r="1.5" />])}
    </svg>
  )
}

function StepFields({ step, onChange }: { step: Step; onChange: (step: Step) => void }) {
  if (step.type === 'replace') {
    const error = replacePatternError(step)
    return (
      <Stack gap={4} className={classes.fields}>
        <Group gap={6} grow>
          <TextInput size="xs" placeholder="Find" value={step.find} error={error} onChange={(e) => onChange({ ...step, find: e.currentTarget.value })} />
          <TextInput size="xs" placeholder="Replace with" value={step.replace} onChange={(e) => onChange({ ...step, replace: e.currentTarget.value })} />
        </Group>
        <Checkbox size="xs" label="Regular expression" checked={step.regex} onChange={(e) => onChange({ ...step, regex: e.currentTarget.checked })} />
      </Stack>
    )
  }
  if (step.type === 'default') {
    return (
      <div className={classes.fields}>
        <TextInput size="xs" placeholder="Value for empty cells" value={step.value} onChange={(e) => onChange({ ...step, value: e.currentTarget.value })} />
      </div>
    )
  }
  return null
}

interface SortableStepProps {
  id: string
  step: Step
  animate: boolean
  onChange: (step: Step) => void
  onRemove: () => void
}

/** Arrastrar desde un campo o botón del paso no debe moverlo (seleccionar texto, escribir, quitar). */
function fromControl(event: { target: EventTarget; currentTarget: EventTarget }) {
  return event.target !== event.currentTarget && (event.target as Element).closest('input, textarea, button, label') !== null
}

function SortableStep({ id, step, animate, onChange, onRemove }: SortableStepProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const label = STEP_LABELS[step.type].replace('…', '')

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? `${classes.step} ${classes.dragging}` : classes.step}
      style={{ transform: CSS.Translate.toString(transform), transition: animate ? transition : undefined }}
      {...attributes}
      aria-label={`${label}. Press space to reorder.`}
      onPointerDown={(event) => {
        if (!fromControl(event)) listeners?.onPointerDown?.(event)
      }}
      onKeyDown={(event) => {
        // Solo con foco en la caja: Espacio dentro de un campo debe escribir un espacio.
        if (event.target === event.currentTarget) listeners?.onKeyDown?.(event)
      }}
    >
      <Group gap={4} wrap="nowrap">
        <span className={classes.handle}>
          <GripIcon />
        </span>
        <Text size="sm" style={{ flex: 1 }}>
          {label}
        </Text>
        <ActionIcon size="sm" variant="subtle" color="gray" aria-label={`Remove ${label}`} onClick={onRemove}>
          <IconX size={14} />
        </ActionIcon>
      </Group>
      <StepFields step={step} onChange={onChange} />
    </div>
  )
}

interface Props {
  columnKey: string
  steps: Step[]
  onChange: (steps: Step[]) => void
}

export function ColumnSteps({ columnKey, steps, onChange }: Props) {
  const [opened, setOpened] = useState(false)
  const [dragging, setDragging] = useState(false)
  const animate = !useReducedMotion()
  const sensors = useSensors(
    // Un pequeño umbral para que un clic en la manija no cuente como arrastre.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const ids = steps.map((step) => step.id)
  const update = (index: number, step: Step) => onChange(steps.map((s, i) => (i === index ? step : s)))


  function handleDragEnd({ active, over }: DragEndEvent) {
    setDragging(false)
    if (!over || active.id === over.id) return
    onChange(arrayMove(steps, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width={340}
      shadow="md"
      trapFocus
      // Escape cancela el arrastre con teclado; no debe cerrar el popover al mismo tiempo.
      closeOnEscape={!dragging}
    >
      <Popover.Target>
        <ActionIcon
          variant={steps.length > 0 ? 'light' : 'subtle'}
          color={steps.length > 0 ? undefined : 'gray'}
          size="sm"
          aria-label={`Normalize ${columnKey}`}
          onClick={() => setOpened((o) => !o)}
        >
          <GearIcon />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text fw={600} ff="monospace" size="sm">
            {columnKey}
          </Text>
          <Text size="xs" c="dimmed">
            Steps run top to bottom, after normalizing all columns. Drag to reorder.
          </Text>

          {steps.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragStart={() => setDragging(true)}
              onDragCancel={() => setDragging(false)}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <Stack gap={2}>
                  {steps.map((step, index) => (
                    <SortableStep
                      key={ids[index]}
                      id={ids[index]}
                      step={step}
                      animate={animate}
                      onChange={(next) => update(index, next)}
                      onRemove={() => onChange(steps.filter((_, i) => i !== index))}
                    />
                  ))}
                </Stack>
              </SortableContext>
            </DndContext>
          )}

          <Select
            size="xs"
            placeholder="+ Add step"
            data={STEP_OPTIONS}
            value={null}
            onChange={(type) => type && onChange([...steps, newStep(type as StepType)])}
            comboboxProps={{ withinPortal: false }}
          />

          <Group justify="space-between">
            <Button
              size="compact-sm"
              variant="subtle"
              color="gray"
              leftSection={<IconTrash size={14} />}
              disabled={steps.length === 0}
              onClick={() => onChange([])}
            >
              Clear all
            </Button>
            <Button size="compact-sm" leftSection={<IconCheck size={14} />} onClick={() => setOpened(false)}>
              Done
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
