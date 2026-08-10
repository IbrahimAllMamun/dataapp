import { useEffect, useState } from "react";

/**
 * Filter panel.
 *
 * The parent owns filter state; this component only renders controls and
 * reports changes. Defaults live on the server (/api/filters -> defaults) and
 * are applied through the SAME routine as "Clear all", so the opening view and
 * the reset view can never drift apart.
 */
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

  if (!options) return <div className="filters muted">Loading filters…</div>;

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
          <input
            type="search"
            value={term}
            placeholder="Type to narrow…"
            onChange={(e) => setTerm(e.target.value)}
          />
        </label>
      </div>

      <div className="filter-row">
        <fieldset className="filter checks">
          <legend>Product Category</legend>
          {options.products.map((p) => (
            <label key={p} className="check">
              <input
                type="checkbox"
                checked={value.products.includes(p)}
                onChange={() => set({ products: toggleIn(value.products, p) })}
              />
              {p}
            </label>
          ))}
        </fieldset>

        <fieldset className="filter checks">
          <legend>Litigation Status</legend>
          {options.statuses.map((s) => (
            <label key={s} className="check">
              <input
                type="checkbox"
                checked={value.statuses.includes(s)}
                onChange={() => set({ statuses: toggleIn(value.statuses, s) })}
              />
              {s}
            </label>
          ))}
        </fieldset>

        <fieldset className="filter checks">
          <legend>Warrant</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={value.warrant}
              onChange={(e) => set({ warrant: e.target.checked })}
            />
            Warrant cases only
          </label>
        </fieldset>

        <div className="filter actions">
          {typeof total === "number" && (
            <span className="muted">{total.toLocaleString()} matching</span>
          )}
          <button className="ghost" onClick={onClear}>Clear all</button>
        </div>
      </div>
    </div>
  );
}
