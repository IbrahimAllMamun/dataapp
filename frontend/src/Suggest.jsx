import { useEffect, useMemo, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "./icons.jsx";

/**
 * A text box that suggests from a fixed list.
 *
 * The whole list arrives with /api/filters and is matched here rather than per
 * keystroke over the network — there are only tens of law firms and plaintiffs,
 * so a request per character would cost more than it saves.
 *
 * `options` is `[{ value, label, hint }]`. `value` is what the filter sends;
 * `label`/`hint` are what the row shows, which is how a plaintiff can offer its
 * name and CIF together while either one matches.
 *
 * Free text is honoured: the value is whatever is typed, so a term matching
 * nothing in the list still filters (and correctly returns nothing).
 *
 * Every match is reachable: the box renders a page at a time and appends the
 * next one as the list nears its bottom, so scrolling walks the full list
 * instead of stopping at an arbitrary cut.
 */

// One page of rows. Must comfortably exceed what .suggest-list shows at its
// 260px max-height (~8 rows) — if a page fit without overflowing there would
// be nothing to scroll, no scroll event, and the rest would never load.
const PAGE = 20;

export default function Suggest({ label, placeholder, value, options, onChange }) {
  const [term, setTerm] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [shown, setShown] = useState(PAGE);
  const wrapRef = useRef(null);
  const listRef = useRef(null);

  // Follow the parent when it resets (Clear all, or a tab change).
  useEffect(() => setTerm(value ?? ""), [value]);

  // Debounced, like the other search boxes — typing should not fire a request
  // per character.
  useEffect(() => {
    if (term === (value ?? "")) return;
    const id = setTimeout(() => onChange(term), 300);
    return () => clearTimeout(id);
  }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const t = term.trim().toLowerCase();
    const pool = options ?? [];
    // An empty box offers everything rather than nothing — it doubles as
    // "what is even in here?".
    if (!t) return pool;
    return pool.filter(
      (o) =>
        o.label.toLowerCase().includes(t) ||
        (o.hint ?? "").toLowerCase().includes(t),
    );
  }, [term, options]);

  // Back to the first page whenever the list's contents change under it, or it
  // is closed — reopening a box scrolled deep into its list would be a
  // surprise.
  //
  // The scroll has to go back with it. Dropping to one page while parked at the
  // bottom leaves scrollTop past the new end, the browser clamps it, and the
  // clamp is itself a scroll event landing at the bottom — which loads another
  // page, and another. Typing after scrolling deep came back with three pages
  // rendered instead of one.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
    setShown(PAGE);
  }, [term, open]);

  const visible = matches.slice(0, shown);

  // Close when the focus or the pointer leaves the control entirely.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the keyboard cursor on screen. `nearest` is deliberate: it does
  // nothing when the row is already visible, so hovering never yanks the list.
  useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelectorAll(".suggest-item")[active]
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Append the next page once the scroll is within a row or two of the end.
  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 48) return;
    setShown((n) => (n >= matches.length ? n : n + PAGE));
  };

  const commit = (opt) => {
    setTerm(opt.value);
    onChange(opt.value); // immediate: a click is not a keystroke to debounce
    setOpen(false);
    setActive(-1);
  };

  // Arrow keys walk the whole match set, not just the rendered page — reaching
  // past the last rendered row pulls in enough pages to cover the new cursor.
  const move = (delta) => {
    if (!matches.length) return;
    const next = active + delta;
    const i = next < 0 ? matches.length - 1 : next % matches.length;
    setActive(i);
    if (i >= shown) {
      setShown(Math.min(matches.length, Math.ceil((i + 1) / PAGE) * PAGE));
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!matches.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      commit(matches[active]);
    }
  };

  return (
    <label className="filter grow suggest" ref={wrapRef}>
      <span>{label}</span>
      <div className="search-wrap">
        <SearchIcon />
        <input
          // type=search, not text: every input rule in index.css is keyed to
          // [type="search"] — the border, the padding that clears the icon,
          // the widths. A text input inherited none of them and sat unstyled
          // with the magnifier on top of the placeholder. role=combobox
          // carries the semantics.
          type="search"
          value={term}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {term && (
          <button
            type="button"
            className="search-clear"
            onClick={() => {
              setTerm("");
              onChange("");
              setOpen(false);
            }}
            aria-label={`Clear ${label}`}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {open && (
        <div
          className="suggest-list"
          role="listbox"
          ref={listRef}
          onScroll={onScroll}
        >
          {matches.length === 0 && (
            <p className="suggest-empty muted">No match</p>
          )}
          {visible.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={i === active}
              aria-setsize={matches.length}
              aria-posinset={i + 1}
              className={`suggest-item${i === active ? " active" : ""}`}
              // mousedown, not click: the document-level close listener fires
              // on mousedown and would unmount this before a click landed.
              onMouseDown={(e) => {
                e.preventDefault();
                commit(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="suggest-label">{o.label}</span>
              {o.hint && <span className="badge cif">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}
