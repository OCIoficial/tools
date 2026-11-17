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
import { useReducedMotion } from '@mantine/hooks'
import type { ReactNode } from 'react'
import { useSending } from '../store.ts'
import classes from './SortableList.module.css'

function GripIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden>
      {[3, 8, 13].flatMap((y) => [<circle key={`l${y}`} cx="3.5" cy={y} r="1.5" />, <circle key={`r${y}`} cx="8.5" cy={y} r="1.5" />])}
    </svg>
  )
}

interface ItemProps {
  id: string
  label: string
  animate: boolean
  children: (handle: ReactNode) => ReactNode
}

/** Dragged only by the handle: the rest of the item has fields and buttons. */
function SortableItem({ id, label, animate, children }: ItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className={classes.handle}
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${label}. Press space to pick up.`}
    >
      <GripIcon />
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      className={isDragging ? `${classes.item} ${classes.dragging}` : classes.item}
      style={{ transform: CSS.Translate.toString(transform), transition: animate ? transition : undefined }}
    >
      {children(handle)}
    </div>
  )
}

interface Props<T> {
  items: T[]
  getId: (item: T) => string
  /** Accessible name of each item, for the handle. */
  getLabel: (item: T) => string
  onReorder: (items: T[]) => void
  /** Renders an item; `handle` is the handle to drag it. */
  children: (item: T, handle: ReactNode) => ReactNode
  gap?: number
}

/** Vertical list reordered by dragging each item's handle (or with the keyboard). */
export function SortableList<T>({ items, getId, getLabel, onReorder, children, gap = 8 }: Props<T>) {
  const animate = !useReducedMotion()
  // Reordering changes the emails' attachments: not while sending.
  const sending = useSending()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = items.map(getId)

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    onReorder(arrayMove(items, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={sending}>
        <div className={classes.list} style={{ gap }}>
          {items.map((item, index) => (
            <SortableItem key={ids[index]} id={ids[index]} label={getLabel(item)} animate={animate}>
              {(handle) => children(item, handle)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
