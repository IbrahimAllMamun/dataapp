import { useEffect, useState } from "react";
import MultiSelect from "./MultiSelect.jsx";
import Suggest from "./Suggest.jsx";
import { CloseIcon, SearchIcon } from "./icons.jsx";

/**
 * Filter panel.
 *
 * The parent owns filter state; this component only renders controls and
 * reports changes. Defaults live on the server (/api/filters -> defaults) and
 * are applied through the SAME routine as "Clear all", so the opening view and
 * the reset view can never drift apart.
 */

// Must match filters.WARRANT_EXECUTED on the API — it is the one state that
// takes a year.
export const WARRANT_EXECUTED = "Warrant Executed";

/** Which controls a tab wants. Anything omitted defaults to shown. */
const ALL = {
  branch: true,
  upcoming: true,
  search: true,
  products: true,
  statuses: true,
  warrant: true,
  // Suggestion boxes. Separate from `search`, which picks out individual cases
  // by client/CIF/account; these narrow what is being aggregated.
  firm: false,
  plaintiff: false,
};

export default function Filters({
  suit,
  value,
  onChange,
  onClear,
  total,
  show: showProp,
}) {
  const show = { ...ALL, ...showProp };
  const [options, setOptions] = useState(null);
  const [term, setTerm] = useState(value.q ?? "");

  // Reload options when the suit changes — branch lists are suit-scoped.
  useEffect(() => {
    const ctrl = new AbortController();
    // The Summary tab has no suit, and template-stringing an undefined one
    // sends the literal "undefined", which matches no suit_type — the branch
    // list is the only option scoped by it, so it came back empty.
    const qs = suit ? `?suit=${encodeURIComponent(suit)}` : "";

    fetch(`/api/filters${qs}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => body && setOptions(body))
      .catch(() => {});
    return () => ctrl.abort();
  }, [suit]);

  // Keep the search box in step when the parent resets filters. The two
  // suggestion boxes track `value` themselves.
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
  // The suggestion rows: a firm is just its name; a plaintiff carries its CIF
  // as the hint, and either half matches.
  const firmOptions = (options.law_firms ?? []).map((f) => ({
    value: f,
    label: f,
  }));
  const plaintiffOptions = (options.plaintiffs ?? []).map((p) => ({
    // The name is what reads in the box; the CIF still matches while typing.
    value: p.name,
    label: p.name,
    hint: p.cif,
  }));

  const products = [...options.products].sort(
    (a, b) => (a === "SME" ? 0 : 1) - (b === "SME" ? 0 : 1),
  );

  return (
    <div className="filters">
      <div className="filter-row">
        {show.branch && (
          <label className="filter">
            <span>Branch</span>
            <select
              value={value.branch}
              onChange={(e) => set({ branch: e.target.value })}
            >
              <option value="All">All</option>
              {options.branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        )}

        {show.upcoming && (
          <label className="filter">
            <span>Upcoming Hearing</span>
            <select
              value={value.upcoming}
              onChange={(e) => set({ upcoming: e.target.value })}
            >
              <option value="All">All</option>
              {options.upcoming.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        )}

        {show.firm && (
          <Suggest
            label="Law Firm"
            placeholder="Firm name…"
            value={value.firm}
            options={firmOptions}
            onChange={(v) => set({ firm: v })}
          />
        )}

        {show.plaintiff && (
          <Suggest
            label="Plaintiff"
            placeholder="Name or CIF…"
            value={value.plaintiff}
            options={plaintiffOptions}
            onChange={(v) => set({ plaintiff: v })}
          />
        )}

        {show.search && (
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
        )}
      </div>

      <div className="filter-row">
        {show.products && (
          <MultiSelect
            label="Product Category"
            options={products}
            selected={value.products}
            onToggle={(p) => set({ products: toggleIn(value.products, p) })}
          />
        )}

        {show.statuses && (
          <MultiSelect
            label="Litigation Status"
            options={options.statuses}
            selected={value.statuses}
            onToggle={(s) => set({ statuses: toggleIn(value.statuses, s) })}
          />
        )}

        {show.warrant && (
          <label className="filter">
            <span>Warrant</span>
            <select
              value={value.warrant}
              onChange={(e) =>
                // Reset the year alongside the state: a year left over from a
                // previous "Warrant Executed" would otherwise be sent again
                // the moment it is re-selected.
                set({ warrant: e.target.value, warrantYear: "All" })
              }
            >
              <option value="All">All</option>
              {(options.warrant_states ?? []).map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Only an executed warrant has a year to narrow by — a pending one
            has not happened yet. */}
        {show.warrant && value.warrant === WARRANT_EXECUTED && (
          <label className="filter">
            <span>Year of Warrant</span>
            <select
              value={value.warrantYear}
              onChange={(e) => set({ warrantYear: e.target.value })}
            >
              <option value="All">All</option>
              {(options.warrant_years ?? []).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="filter actions">
          {typeof total === "number" && (
            <span className="match-count">
              <b>{total.toLocaleString()}</b> Cases
            </span>
          )}
          <button className="ghost" onClick={onClear}>
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}
