"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Check, ChevronDown, Plus as PlusIcon, Search, X } from "lucide-react";

export type SearchOption = { value: string; label: string; description?: string; searchText?: string };

const defaultStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };

function filteredOptions(options: SearchOption[], query: string, selectedValues: string[]) {
  const normalized = query.trim().toLocaleLowerCase();
  return options.filter((option) => !selectedValues.includes(option.value)
    && (!normalized || `${option.label} ${option.description ?? ""} ${option.searchText ?? ""}`.toLocaleLowerCase().includes(normalized))).slice(0, 50);
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Type to search...",
  required = false,
  disabled = false,
  allowCustom = false,
  className = "",
  style,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  allowCustom?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryEdited = useRef(false);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);
  const visibleOptions = useMemo(() => filteredOptions(options, query, []), [options, query]);

  useEffect(() => {
    if (queryEdited.current) {
      queryEdited.current = false;
      return;
    }
    setQuery(selected?.label ?? (allowCustom ? value : ""));
  }, [allowCustom, selected?.label, value]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const choose = (option: SearchOption) => {
    queryEdited.current = false;
    onChange(option.value);
    setQuery(option.label);
    inputRef.current?.setCustomValidity("");
    setOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, visibleOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && visibleOptions[activeIndex]) {
      event.preventDefault();
      choose(visibleOptions[activeIndex]);
    } else if (event.key === "Escape") {
      queryEdited.current = false;
      setOpen(false);
      setQuery(selected?.label ?? (allowCustom ? value : ""));
    }
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <div className="flex min-h-10 items-center gap-2 rounded border px-3" style={{ ...defaultStyle, ...style, opacity: disabled ? 0.55 : 1 }}>
        <Search size={14} aria-hidden="true" className="shrink-0" style={{ color: "var(--muted-foreground)" }} />
        <input
          ref={inputRef}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={open && visibleOptions[activeIndex] ? `${listboxId}-option-${visibleOptions[activeIndex].value}` : undefined}
          required={required}
          disabled={disabled}
          autoComplete="off"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);
            setActiveIndex(0);
            queryEdited.current = allowCustom || Boolean(value);
            onChange(allowCustom ? nextQuery : "");
            event.currentTarget.setCustomValidity(required && !allowCustom && nextQuery ? "Select a result from the list." : "");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none disabled:cursor-not-allowed"
          style={{ color: "var(--foreground)" }}
        />
        {query && <button type="button" tabIndex={-1} disabled={disabled} aria-label="Clear selection" onClick={() => { queryEdited.current = allowCustom || Boolean(value); setQuery(""); onChange(""); inputRef.current?.setCustomValidity(""); setOpen(true); inputRef.current?.focus(); }} className="shrink-0" style={{ color: "var(--muted-foreground)" }}><X size={14} aria-hidden="true" /></button>}
        <ChevronDown size={14} aria-hidden="true" className="shrink-0" style={{ color: "var(--muted-foreground)" }} />
      </div>
      {open && !disabled && <div id={listboxId} role="listbox" className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded border py-1 shadow-xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        {visibleOptions.map((option, index) => <button
          key={option.value}
          id={`${listboxId}-option-${option.value}`}
          type="button"
          role="option"
          aria-selected={option.value === value}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(option)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-black/5"
          style={{ background: index === activeIndex ? "var(--secondary)" : "transparent" }}
        ><span className="min-w-0"><span className="block truncate text-sm" style={{ color: "var(--foreground)" }}>{option.label}</span>{option.description && <span className="block truncate text-xs" style={{ color: "var(--muted-foreground)" }}>{option.description}</span>}</span>{option.value === value && <Check size={14} aria-hidden="true" style={{ color: "var(--primary)" }} />}</button>)}
        {!visibleOptions.length && <p className="px-3 py-3 text-sm" style={{ color: "var(--muted-foreground)" }}>{options.length ? "No matching results." : "No results available."}</p>}
      </div>}
    </div>
  );
}

export function SearchableMultiSelect({
  values,
  onChange,
  options,
  placeholder = "Type to search...",
  disabled = false,
  className = "",
  style,
  ariaLabel,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: SearchOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const visibleOptions = useMemo(() => filteredOptions(options, query, values), [options, query, values]);
  const chosen = options.filter((option) => values.includes(option.value));

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const toggle = (option: SearchOption) => {
    onChange(values.includes(option.value) ? values.filter((value) => value !== option.value) : [...values, option.value]);
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, visibleOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && visibleOptions[activeIndex]) {
      event.preventDefault();
      toggle(visibleOptions[activeIndex]);
    } else if (event.key === "Escape") setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded border px-2 py-1" style={{ ...defaultStyle, ...style, opacity: disabled ? 0.55 : 1 }}>
        {chosen.map((option) => <span key={option.value} className="inline-flex max-w-full items-center gap-1 rounded border px-2 py-1 text-xs" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><span className="truncate">{option.label}</span><button type="button" disabled={disabled} aria-label={`Remove ${option.label}`} onClick={() => onChange(values.filter((value) => value !== option.value))} className="shrink-0" style={{ color: "var(--muted-foreground)" }}><X size={12} aria-hidden="true" /></button></span>)}
        <Search size={14} aria-hidden="true" className="ml-1 shrink-0" style={{ color: "var(--muted-foreground)" }} />
        <input
          ref={inputRef}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={open && visibleOptions[activeIndex] ? `${listboxId}-option-${visibleOptions[activeIndex].value}` : undefined}
          disabled={disabled}
          autoComplete="off"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder={chosen.length ? "Add another..." : placeholder}
          className="min-w-28 flex-1 bg-transparent px-1 py-1 text-sm outline-none disabled:cursor-not-allowed"
          style={{ color: "var(--foreground)" }}
        />
      </div>
      {open && !disabled && <div id={listboxId} role="listbox" aria-multiselectable="true" className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded border py-1 shadow-xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        {visibleOptions.map((option, index) => <button
          key={option.value}
          id={`${listboxId}-option-${option.value}`}
          type="button"
          role="option"
          aria-selected={false}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => toggle(option)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-black/5"
          style={{ background: index === activeIndex ? "var(--secondary)" : "transparent" }}
        ><span className="min-w-0"><span className="block truncate text-sm" style={{ color: "var(--foreground)" }}>{option.label}</span>{option.description && <span className="block truncate text-xs" style={{ color: "var(--muted-foreground)" }}>{option.description}</span>}</span><PlusIcon size={14} aria-hidden="true" style={{ color: "var(--primary)" }} /></button>)}
        {!visibleOptions.length && <p className="px-3 py-3 text-sm" style={{ color: "var(--muted-foreground)" }}>{options.length ? "No matching results." : "No results available."}</p>}
      </div>}
    </div>
  );
}