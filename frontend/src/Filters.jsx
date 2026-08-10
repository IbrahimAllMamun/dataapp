import { useEffect, useState } from "react";
import { CheckIcon, CloseIcon, SearchIcon } from "./icons.jsx";

/**
 * Filter panel.
 *
 * The parent owns filter state; this component only renders controls and
 * reports changes. Defaults live on the server (/api/filters -> defaults) and
 * are applied through the SAME routine as "Clear all", so the opening view and
 * the reset view can never drift apart.
 */

/** Checkbox styled as a toggle chip. The native input stays for a11y. */
function Chip({ checked, onChange, children }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="box" aria-hidden="true">
        <CheckIcon />
      </span>
      {children}
    </label>
  );
}

export default function Filters({ suit, value, onChange, onClear, total }) {
  const [options, setOptions] = useState(null);
  const [term, setTerm] = useState(value.q ?? "");

  // Reload options when the suit changes — branch lists are suit-scoped.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/filters?suit=${encodeURIComponent(suit)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => body && setOptions(body))
      .catch(() => {});
    return () => ctrl.abort();
  }, [suit]);

  // Keep the search box in step when the parent resets filters.
  useEffect(() => setTerm(value.q ?? ""), [value.q]);

  // Debounce typing so we don't fire a request per keystroke.
  useEffect(() => {
    if (term === (value.q ?? "")) return;
    const id = setTimeout(() => onChange({ ...value, q: term }), 300);
    return () => clearTimeout(id);
  }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => onChange({ ...value, ...patch });

  const toggleIn = (list, item) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  if (!options) {
    return (
      <div className="filters" aria-busy="true">
        <div className="filters-skeleton">
          <span className="sk" style={{ "--sk-w": "190px" }} />
          <span className="sk" style={{ "--sk-w": "190px" }} />
          <span className="sk" style={{ "--sk-w": "260px" }} />
        </div>
      </div>
    );
  }

  // The API orders labels alphabetically, which puts "Other" ahead of "SME".
  // SME is the default selection and the one people scan for, so it leads.
  // Sort is stable, so any other label keeps the server's order.
  const products = [...options.products].sort(
    (a, b) => (a === "SME" ? 0 : 1) - (b === "SME" ? 0 : 1)
  );

  return (
    <div className="filters">
      <div className="filter-row">
        <label className="filter">
          <span>Branch</span>
          <select value={value.branch} onChange={(e) => set({ branch: e.target.value })}>
            <option value="All">All</option>
            {options.branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>

        <label className="filter">
          <span>Upcoming Hearing</span>
          <select value={value.upcoming} onChange={(e) => set({ upcoming: e.target.value })}>
            <option value="All">All</option>
            {options.upcoming.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>

        <label className="filter grow">
          <span>Search client / CIF / account</span>
          <div className="search-wrap">
            <SearchIcon />
            <input
              type="search"
              value={term}
              placeholder="Type to narrow…"
              onChange={(e) => setTerm(e.target.value)}
            />
            {term && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setTerm("")}
                aria-label="Clear search"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </label>
      </div>

      <div className="filter-row">
        <fieldset className="filter checks">
          <legend>Product Category</legend>
          {products.map((p) => (
            <Chip
              key={p}
              checked={value.products.includes(p)}
              onChange={() => set({ products: toggleIn(value.products, p) })}
            >
              {p}
            </Chip>
          ))}
        </fieldset>

        <fieldset className="filter checks">
          <legend>Litigation Status</legend>
          {options.statuses.map((s) => (
            <Chip
              key={s}
              checked={value.statuses.includes(s)}
              onChange={() => set({ statuses: toggleIn(value.statuses, s) })}
            >
              {s}
            </Chip>
          ))}
        </fieldset>

        <fieldset className="filter checks">
          <legend>Warrant</legend>
          <Chip
            checked={value.warrant}
            onChange={(e) => set({ warrant: e.target.checked })}
          >
            Warrant cases only
          </Chip>
        </fieldset>

        <div className="filter actions">
          {typeof total === "number" && (
            <span className="match-count">
              <b>{total.toLocaleString()}</b> matching
            </span>
          )}
          <button className="ghost" onClick={onClear}>Clear all</button>
        </div>
      </div>
    </div>
  );
}
