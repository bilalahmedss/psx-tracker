"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SecurityOption = { symbol: string; name: string };

/**
 * Type-ahead stock search over our securities table. Matches symbol prefix
 * first, then symbol or name anywhere. Keyboard: up/down, Enter, Escape.
 */
export function SymbolCombobox({
  id,
  name,
  options,
  value,
  onChange,
  invalid,
  describedBy,
  autoFocus,
}: {
  id: string;
  name: string;
  options: SecurityOption[];
  value: string;
  onChange: (symbol: string) => void;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  const selected = options.find((o) => o.symbol === value);
  const [query, setQuery] = useState(selected ? `${selected.symbol} · ${selected.name}` : value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q || (selected && query === `${selected.symbol} · ${selected.name}`)) return options.slice(0, 8);
    const starts = options.filter((o) => o.symbol.startsWith(q));
    const contains = options.filter((o) => !o.symbol.startsWith(q) && (o.symbol.includes(q) || o.name.toUpperCase().includes(q)));
    return [...starts, ...contains].slice(0, 8);
  }, [options, query, selected]);

  const choose = (o: SecurityOption) => {
    onChange(o.symbol);
    setQuery(`${o.symbol} · ${o.name}`);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Search symbol or company"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
          // Typing an exact symbol selects it; anything else clears the selection.
          const exact = options.find((o) => o.symbol === e.target.value.trim().toUpperCase());
          onChange(exact ? exact.symbol : "");
        }}
        onFocus={(e) => {
          setOpen(true);
          e.target.select();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 ? (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md">
          {matches.map((o, i) => (
            <li
              key={o.symbol}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5", i === active && "bg-accent text-accent-foreground")}
            >
              <span className="font-medium">{o.symbol}</span>
              <span className="truncate text-xs text-muted-foreground">{o.name}</span>
            </li>
          ))}
        </ul>
      ) : open && query.trim() ? (
        <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          No matching stocks.
        </div>
      ) : null}
    </div>
  );
}
