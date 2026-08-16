import { useEffect, useLayoutEffect, useRef, useState } from "react";
import NameCell from "./NameCell.jsx";
import { LABELS, formatCell, mergeIdentityColumns } from "./format.js";
import { AlertIcon, ChevronIcon, EmptyIcon } from "./icons.jsx";

const num = (v) =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString();

// Enough for every error group in practice; the count on the parent row still
// tells the truth if a group ever exceeds it.
const PAGE_SIZE = 500;

/** Case rows for one error type, fetched the first time it is opened. */
function useErrorCases(errorType, filters, enabled) {
  const [state, setState] = useState({ loading: false, rows: [], columns: [], error: null });

  useEffect(() => {
    if (!enabled) return;

    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    const qs = new URLSearchParams({ error_type: errorType, page_size: String(PAGE_SIZE) });
    if (filters.branch && filters.branch !== "All") qs.set("branch", filters.branch);
    filters.products.forEach((p) => qs.append("products", p));

    fetch(`/api/error_cases?${qs}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.detail || `Request failed (${res.status})`);
        return body;
      })
      .then((body) =>
        setState({
          loading: false,
          rows: body.rows ?? [],
          // error_type repeats the parent row, so it is dropped here.
          columns: mergeIdentityColumns(body.columns ?? []).filter((c) => c !== "error_type"),
          error: null,
        }),
      )
      .catch((err) => {
        if (err.name === "AbortError") return;
        setState({ loading: false, rows: [], columns: [], error: err.message });
      });

    return () => ctrl.abort();
  }, [errorType, filters, enabled]);

  return state;
}

function ErrorGroup({ row, open, onToggle, filters, onPick, colSpan }) {
  const { loading, rows, columns, error } = useErrorCases(row.error_type, filters, open);

  return (
    <>
      <tr
        className={`lvl-suit sticky-row${open ? " is-open" : ""}`}
        tabIndex={0}
        role="button"
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <td className="grp">
          <span className="grp-label">
            <ChevronIcon className="twisty" />
            {row.error_type ?? "—"}
          </span>
        </td>
        <td className="num">{num(row.cases)}</td>
      </tr>

      {open && error && (
        <tr className="lvl-status">
          <td colSpan={colSpan}>
            <div className="error" role="alert">
              <AlertIcon />
              <div>
                <strong>Could not load these cases.</strong> {error}
              </div>
            </div>
          </td>
        </tr>
      )}

      {open && loading && (
        <tr className="lvl-status sk-row">
          {Array.from({ length: colSpan }).map((_, c) => (
            <td key={c}>
              <span className="sk" style={{ "--sk-w": `${45 + ((c * 31) % 45)}%` }} />
            </td>
          ))}
        </tr>
      )}

      {open && !loading && !error && rows.length === 0 && (
        <tr className="lvl-status">
          <td className="muted center" colSpan={colSpan}>
            No cases in this group.
          </td>
        </tr>
      )}

      {open && !loading && !error && rows.length > 0 && (
        <tr className="lvl-status err-cases">
          <td colSpan={colSpan}>
            {/* A nested table so the case columns size themselves rather than
                being forced into the two-column outer grid. */}
            <table className="inner err-inner">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{LABELS[c] ?? c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.caseid}
                    className="row-click"
                    tabIndex={0}
                    onClick={() => onPick(r.caseid)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPick(r.caseid);
                      }
                    }}
                  >
                    {columns.map((c) => (
                      <td key={c}>
                        {c === "clientname" ? (
                          <NameCell column={c} row={r} />
                        ) : (
                          formatCell(c, r[c])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Errors({ data, loading, filters, onPick }) {
  const [open, setOpen] = useState(() => new Set());
  const bodyRef = useRef(null);

  const rows = data?.rows ?? [];
  const COLSPAN = 2;

  const toggle = (t) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  // Same stacked-sticky chain as the summary: the header and every error-type
  // row park one under the next instead of overlapping.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    const stick = () => {
      const table = body.parentElement;
      const sticky = [
        // :scope > thead — a bare "thead tr" also matches the nested
        // case table inside an expanded row, which would take a slot in the
        // chain and push every row below it down by its height.
        ...(table?.querySelectorAll(":scope > thead > tr") ?? []),
        ...body.querySelectorAll("tr.sticky-row"),
      ];
      let offset = 0;
      sticky.forEach((tr, i) => {
        tr.style.setProperty("--stick-top", `${offset}px`);
        tr.style.setProperty("--stick-z", String(sticky.length - i));
        offset += tr.getBoundingClientRect().height;
      });
    };

    stick();
    const ro = new ResizeObserver(stick);
    ro.observe(body);
    return () => ro.disconnect();
  }, [rows, open]);

  if (loading && !data) {
    return (
      <div className="panel summary-panel">
        <div className="table-scroll">
          <table className="summary">
            <tbody>
              {Array.from({ length: 3 }).map((_, r) => (
                <tr className="sk-row" key={r}>
                  {Array.from({ length: COLSPAN }).map((_, c) => (
                    <td key={c}>
                      <span className="sk" style={{ "--sk-w": `${50 + c * 20}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="panel summary-panel">
        <div className="empty">
          <EmptyIcon />
          <strong>No invalid data</strong>
          <span>Every case passes the filing-date checks.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel summary-panel">
      <div className="table-scroll">
        <table className="summary errors">
          <thead>
            <tr>
              <th className="grp">Error Type</th>
              <th className="num">Cases</th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {rows.map((r) => (
              <ErrorGroup
                key={r.error_type}
                row={r}
                open={open.has(r.error_type)}
                onToggle={() => toggle(r.error_type)}
                filters={filters}
                onPick={onPick}
                colSpan={COLSPAN}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
