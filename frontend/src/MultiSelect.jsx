import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon, ChevronIcon } from "./icons.jsx";

/**
 * A dropdown that keeps multi-select.
 *
 * Deliberately not a native <select multiple>: that renders as an always-open
 * list box, not a dropdown, and a plain <select> would allow only one value —
 * the filter API takes a list.
 */
export default function MultiSelect({ label, options, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const id = useId();

  // Close on outside click or Escape. Only listens while open.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      wrapRef.current?.querySelector(".ms-trigger")?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The trigger has to say what is selected without opening it.
  const summary =
    selected.length === 0
      ? "None"
      : selected.length === options.length
        ? "All"
        : selected.length === 1
          ? selected[0]
          : `${selected[0]} +${selected.length - 1}`;

  return (
    <div className="filter ms" ref={wrapRef}>
      <span id={`${id}-label`}>{label}</span>

      <button
        type="button"
        className={`ms-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-labelledby={`${id}-label`}
      >
        <span className={`ms-summary${selected.length ? "" : " none"}`}>{summary}</span>
        <ChevronIcon />
      </button>

      {open && (
        <div className="ms-panel" role="group" aria-labelledby={`${id}-label`}>
          {options.map((o) => (
            <label key={o} className="ms-option">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={() => onToggle(o)}
              />
              <span className="box" aria-hidden="true">
                <CheckIcon />
              </span>
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
