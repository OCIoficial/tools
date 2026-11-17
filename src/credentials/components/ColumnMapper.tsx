import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CloseButton, Text } from "@mantine/core";
import { IconGripVertical } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import { FIELDS, type FieldKey, type Mapping } from "../lib/fields";
import classes from "./ColumnMapper.module.css";

interface Props {
  columns: string[];
  samples: string[][]; // samples[col] = a few example values
  mapping: Mapping;
  required: FieldKey[];
  onChange: (mapping: Mapping) => void;
}

/** Draggable id format: "col:<index>". Droppable id: "field:<key>" or "pool". */
const colId = (i: number) => `col:${i}`;

export function ColumnMapper({ columns, samples, mapping, required, onChange }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const fieldOf = (col: number): FieldKey | null =>
    (Object.keys(mapping) as FieldKey[]).find((k) => mapping[k] === col) ?? null;

  const assign = (col: number, field: FieldKey | null) => {
    const next: Mapping = { ...mapping };
    const prev = fieldOf(col);
    if (prev) next[prev] = null;
    if (field) next[field] = col;
    onChange(next);
    setSelected(null);
  };

  const onDragStart = (e: DragStartEvent) => {
    setActive(Number(String(e.active.id).split(":")[1]));
    setSelected(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    if (!e.over) return;
    const col = Number(String(e.active.id).split(":")[1]);
    const target = String(e.over.id);
    if (target === "pool") assign(col, null);
    else if (target.startsWith("field:")) assign(col, target.slice(6) as FieldKey);
  };

  const unassigned = columns.map((_, i) => i).filter((i) => fieldOf(i) === null);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className={classes.mapper}>
        <div className={classes.fields}>
          {FIELDS.filter((f) => required.includes(f.key)).map((f) => {
            const col = mapping[f.key];
            return (
              <FieldSlot
                key={f.key}
                field={f.key}
                label={f.label}
                selectable={selected !== null && selected !== col}
                onClick={() => {
                  if (selected !== null) assign(selected, f.key);
                }}
              >
                {col !== null && col < columns.length ? (
                  <ColumnCard
                    index={col}
                    name={columns[col]}
                    samples={samples[col]}
                    selected={selected === col}
                    onSelect={() => setSelected(selected === col ? null : col)}
                    onRemove={() => assign(col, null)}
                    hidden={active === col}
                  />
                ) : (
                  <span className={classes.placeholder}>Drop a column here</span>
                )}
              </FieldSlot>
            );
          })}
        </div>

        <Pool>
          <Text size="sm" mb="xs">
            Unused columns{" "}
            <Text span c="dimmed" inherit>
              — drag onto a field, or tap a column then tap a field
            </Text>
          </Text>
          <div className={classes.poolCards}>
            {unassigned.length === 0 && (
              <Text size="sm" c="dimmed">
                All columns are in use.
              </Text>
            )}
            {unassigned.map((i) => (
              <ColumnCard
                key={i}
                index={i}
                name={columns[i]}
                samples={samples[i]}
                selected={selected === i}
                onSelect={() => setSelected(selected === i ? null : i)}
                hidden={active === i}
              />
            ))}
          </div>
        </Pool>
      </div>
      <DragOverlay dropAnimation={null}>
        {active !== null ? <CardBody name={columns[active]} samples={samples[active]} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function FieldSlot(props: {
  field: FieldKey;
  label: string;
  selectable: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `field:${props.field}` });
  return (
    <div
      ref={setNodeRef}
      className={classes.slot}
      data-over={isOver || undefined}
      data-selectable={props.selectable || undefined}
      // Capture phase so that, with a column selected, tapping anywhere on the
      // slot (including the card already in it) assigns the selection.
      onClickCapture={(e) => {
        if (props.selectable) {
          e.stopPropagation();
          props.onClick();
        }
      }}
    >
      <div className={classes.slotLabel}>{props.label}</div>
      {props.children}
    </div>
  );
}

function Pool({ children }: { children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: "pool" });
  return (
    <div ref={setNodeRef} className={classes.pool} data-over={isOver || undefined}>
      {children}
    </div>
  );
}

function ColumnCard(props: {
  index: number;
  name: string;
  samples: string[];
  selected: boolean;
  hidden: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: colId(props.index) });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: props.hidden ? 0.3 : 1 }}
      onClick={(e) => {
        e.stopPropagation();
        props.onSelect();
      }}
    >
      <CardBody name={props.name} samples={props.samples} selected={props.selected} onRemove={props.onRemove} />
    </div>
  );
}

function CardBody(props: {
  name: string;
  samples: string[];
  selected?: boolean;
  dragging?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div
      className={classes.card}
      data-selected={props.selected || undefined}
      data-dragging={props.dragging || undefined}
    >
      <div className={classes.cardHead}>
        <IconGripVertical size={14} className={classes.grip} aria-hidden />
        <span className={classes.cardName}>{props.name}</span>
        {props.onRemove && (
          <CloseButton
            size="sm"
            title="Unassign"
            aria-label="Unassign"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              props.onRemove?.();
            }}
          />
        )}
      </div>
      <div className={classes.cardSamples}>
        {props.samples.map((s, i) => (
          <div key={i}>{s || <i>(empty)</i>}</div>
        ))}
      </div>
    </div>
  );
}
