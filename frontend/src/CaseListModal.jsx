import { useCallback, useEffect, useRef, useState } from "react";
import NameCell from "./NameCell.jsx";
import { LABELS, isNumericColumn, mergeIdentityColumns } from "./format.js";
import { AlertIcon, CloseIcon } from "./icons.jsx";

const EXIT_MS = 150;
const PAGE_SIZE = 100;

/**
 * The cases behind one drilled-into cell, plus whatever filters were active.
 * Two callers: the Summary tab passes a suit type + present_case_status, the
 * Law Firms tab passes a suit type + law firm. Selecting a row opens that
 * case's details on top of this list rather than replacing it, so closing
 * them returns here.
 */
export default function CaseListModal({
  suit,
  caseStatus,
  lawFirm,
  filters,
  onPick,
  onClose,
  suspended = false,
}) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [closing, setClosing] = useState(false);

  const modalRef = useRef(null);
  const scrollRef = useRef(null);

  const dismiss = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({
      suit,
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    // Only one of these is ever set — sending an empty one would filter on a
    // literal blank rather than being ignored.
    if (caseStatus) qs.set("case_status", caseStatus);
    if (lawFirm) qs.set("law_firm", lawFirm);
    if (filters.branch && filters.branch !== "All") qs.set("branch", filters.branch);
    if (filters.upcoming && filters.upcoming !== "All")
      qs.set("upcoming", filters.upcoming);
    filters.products.forEach((p) => qs.append("products", p));
    filters.statuses.forEach((s) => qs.append("statuses", s));
    // The summary's suggestion boxes narrow what it counted, so the drill-down
    // has to carry them or this list shows more than the row that opened it.
    if (filters.firm) qs.set("firm", filters.firm);
    if (filters.plaintiff) qs.set("plaintiff", filters.plaintiff);

    fetch(`/api/cases?${qs}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.detail || `Request failed (${res.status})`);
        return body;
      })
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [suit, caseStatus, lawFirm, filters, page]);

  useEffect(() => {
    // While a case sits on top of this list, Escape belongs to that case —
    // otherwise one press closes both and drops the user back to the summary.
    if (suspended) return;

    const onKey = (e) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prevFocus = document.activeElement;
    modalRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (prevFocus instanceof HTMLElement) prevFocus.focus();
    };
  }, [dismiss, suspended]);

  const columns = mergeIdentityColumns(data?.columns ?? []);
  const rows = data?.rows ?? [];
  const totalPages = data?.total_pages ?? 0;

  const exitStyle = closing
    ? { animationDirection: "reverse", animationDuration: `${EXIT_MS}ms` }
    : undefined;

  return (
    <div
      className="backdrop"
      onClick={suspended ? undefined : dismiss}
      style={exitStyle}
    >
      <div
        className="modal list-modal"
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${caseStatus ?? lawFirm} — ${suit}`}
        style={exitStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="case-head">
            <h2>
              {caseStatus ?? lawFirm}
              <span className="badge cif">{suit}</span>
            </h2>
            {typeof data?.total === "number" && (
              <p className="subtitle">
                {data.total.toLocaleString()} case{data.total === 1 ? "" : "s"} · current
                filters applied
              </p>
            )}
          </div>
          <button className="icon-btn" onClick={dismiss} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {error && (
          <div className="modal-body">
            <div className="error" role="alert" style={{ marginTop: 16 }}>
              <AlertIcon />
              <div>
                <strong>Could not load these cases.</strong> {error}
              </div>
            </div>
          </div>
        )}

        {!error && (
          <>
            {loading && <div className="loadbar" role="status" aria-label="Loading" />}

            <div className="table-scroll list-scroll" ref={scrollRef}>
              <table>
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c} className={isNumericColumn(c) ? "num" : undefined}>
                        {LABELS[c] ?? c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td className="muted center" colSpan={columns.length || 6}>
                        No cases in this group.
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr
                      key={row.caseid}
                      className="row-click"
                      tabIndex={0}
                      onClick={() => onPick(row.caseid)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onPick(row.caseid);
                        }
                      }}
                    >
                      {columns.map((c) => (
                        <td key={c} className={isNumericColumn(c) ? "num" : undefined}>
                          <NameCell column={c} row={row} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pager">
                <span className="page-info">
                  Page <b>{page.toLocaleString()}</b> of {totalPages.toLocaleString()}
                </span>
                <div className="pager-nav">
                  <button
                    className="ghost"
                    disabled={loading || page <= 1}
                    onClick={() => {
                      setPage((p) => p - 1);
                      scrollRef.current?.scrollTo({ top: 0 });
                    }}
                  >
                    ‹ Prev
                  </button>
                  <button
                    className="ghost"
                    disabled={loading || page >= totalPages}
                    onClick={() => {
                      setPage((p) => p + 1);
                      scrollRef.current?.scrollTo({ top: 0 });
                    }}
                  >
                    Next ›
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
