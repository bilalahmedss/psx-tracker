"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CARD_DEFS, type CardId, type LayoutItem } from "@/lib/dashboard/cards";
import type { Tone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveDashboardLayout } from "./actions";

export type CardValue = { value: string; sub?: string; tone?: Tone };

const toneClass: Record<Tone, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
  flat: "",
};
const defOf = (id: CardId) => CARD_DEFS.find((c) => c.id === id)!;

export function DashboardCards({ initial, values }: { initial: LayoutItem[]; values: Record<CardId, CardValue> }) {
  const [layout, setLayout] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setLayout((l) => arrayMove(l, l.findIndex((x) => x.id === active.id), l.findIndex((x) => x.id === over.id)));
  };

  const persist = (payload: LayoutItem[] | "reset") =>
    startTransition(async () => {
      setError(null);
      const r = await saveDashboardLayout(payload);
      if (!r.ok) setError(r.error ?? "Could not save");
      else {
        const next = payload === "reset" ? CARD_DEFS.map((c) => ({ id: c.id, visible: true })) : payload;
        setLayout(next);
        setSaved(next);
        setEditing(false);
      }
    });

  const shown = editing ? layout : layout.filter((l) => l.visible);

  return (
    <section aria-labelledby="cards-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="cards-heading" className="text-sm font-medium text-muted-foreground">
          Summary
        </h2>
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Drag to reorder (or focus a handle and use arrow keys). Untick to hide.</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => persist("reset")} disabled={pending}>
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setLayout(saved);
                setEditing(false);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => persist(layout)} disabled={pending}>
              {pending ? "Saving…" : "Save layout"}
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            Customize
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown.map((l) => l.id)} strategy={rectSortingStrategy} disabled={!editing}>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {shown.map((item) => (
              <SortableCard
                key={item.id}
                item={item}
                value={values[item.id]}
                editing={editing}
                onToggle={() => setLayout((l) => l.map((x) => (x.id === item.id ? { ...x, visible: !x.visible } : x)))}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {!editing && shown.length === 0 ? <p className="text-sm text-muted-foreground">All cards are hidden. Use Customize to show some.</p> : null}
    </section>
  );
}

function SortableCard({ item, value, editing, onToggle }: { item: LayoutItem; value: CardValue; editing: boolean; onToggle: () => void }) {
  const def = defOf(item.id);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !editing });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex flex-col gap-1 rounded-xl border bg-card p-3",
        editing && !item.visible && "opacity-50",
        isDragging && "z-10 shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted-foreground" title={def.hint}>
          {def.label}
        </span>
        {editing ? (
          <span className="flex items-center gap-1">
            <input type="checkbox" checked={item.visible} onChange={onToggle} aria-label={`Show ${def.label}`} className="size-4 accent-primary" />
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={`Move ${def.label}`}
              className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-accent active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </button>
          </span>
        ) : null}
      </div>
      <span className={cn("text-lg font-semibold tabular-nums money", toneClass[value.tone ?? "flat"])}>{value.value}</span>
      {value.sub ? <span className={cn("text-xs tabular-nums", toneClass[value.tone ?? "flat"] || "text-muted-foreground")}>{value.sub}</span> : null}
    </li>
  );
}
