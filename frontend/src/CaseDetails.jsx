import { useCallback, useEffect, useRef, useState } from "react";
import NameCell from "./NameCell.jsx";
import { LABELS, formatCell, isNumericColumn, mergeIdentityColumns } from "./format.js";
import { AlertIcon, CloseIcon } from "./icons.jsx";

const EXIT_MS = 150;

/** Renders a one-row section (legal / loan) as a label-value grid. */
function FieldGrid({ columns, rows }) {
  if (!rows?.length) return <p className="muted">No data.</p>;

  // Same fold as the table: a CIF/code rides along with its name.
  const cols = mergeIdentityColumns(columns);

  return rows.map((row, i) => (
    <dl className="fields" key={i}>
      {cols.map((c) => (
        <div className="field" key={c}>
          <dt>{LABELS[c] ?? c}</dt>
          <dd className={isNumericColumn(c) ? "num" : undefined}>
            <NameCell column={c} row={row} />
          </dd>
        </div>
      ))}
    </dl>
  ));
}

function HistoryTable({ columns, rows }) {
  if (!rows?.length) return <p className="muted">No hearing history.</p>;

  return (
    <div className="table-scroll">
      <table className="inner">
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
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} className={isNumericColumn(c) ? "num" : undefined}>
                  {formatCell(c, row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Placeholder grid shown while the case payload is in flight. */
function DetailSkeleton() {
  return (
    <section aria-busy="true">
      <h3>Loading case</h3>
      <dl className="fields">
        {Array.from({ length: 8 }).map((_, i) => (
          <div className="field" key={i}>
            <dt>
              <span className="sk" style={{ "--sk-w": "55%", height: "9px" }} />
            </dt>
            <dd>
              <span className="sk" style={{ "--sk-w": `${50 + ((i * 29) % 40)}%` }} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function CaseDetails({ caseId, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [closing, setClosing] = useState(false);

  const modalRef = useRef(null);

  // Play the exit animation, then hand control back to the parent.
  const dismiss = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setDetails(null);

    fetch(`/api/case?caseid=${encodeURIComponent(caseId)}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.detail || `Request failed (${res.status})`);
        return body;
      })
      .then((body) => {
        setDetails(body);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [caseId]);

  // Close on Escape, stop the page behind the modal from scrolling, and move
  // focus into the dialog (restoring it to the row on the way out).
  useEffect(() => {
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
  }, [dismiss]);

  // /api/case returns each view as { columns, rows } — the client fields live
  // on the row, not on the section itself.
  const client = details?.client?.rows?.[0];

  // Reversing the entry animations is enough of an exit — no extra keyframes.
  const exitStyle = closing
    ? { animationDirection: "reverse", animationDuration: `${EXIT_MS}ms` }
    : undefined;

  return (
    <div className="backdrop" onClick={dismiss} style={exitStyle}>
      <div
        className="modal"
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Case ${caseId} details`}
        style={exitStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="case-head">
            {/* Falls back to the case id until the payload lands, so the
                header is never momentarily blank. */}
            <h2>
              {client?.clientname ?? `Case ${caseId}`}
              {client?.cif != null && client.cif !== "" && (
                <span className="badge cif" title={LABELS.cif}>
                  {formatCell("cif", client.cif)}
                </span>
              )}
            </h2>
            {client?.branch && (
              <p className="subtitle">{formatCell("branch", client.branch)}</p>
            )}
          </div>
          <button className="icon-btn" onClick={dismiss} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="modal-body">
          {loading && <DetailSkeleton />}

          {error && (
            <div className="error" role="alert" style={{ marginTop: 16 }}>
              <AlertIcon />
              <div>
                <strong>Could not load this case.</strong> {error}
              </div>
            </div>
          )}

          {details && (
            <>
              <section>
                <h3>Legal</h3>
                <FieldGrid {...details.legal} />
              </section>

              <section>
                <h3>
                  Loan
                </h3>
                <FieldGrid {...details.loan} />
              </section>

              <section>
                <h3>
                  Hearing History
                  <span className="count">{details.history.rows.length}</span>
                </h3>
                <HistoryTable {...details.history} />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
