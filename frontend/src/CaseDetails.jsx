import { useEffect, useState } from "react";
import { LABELS, formatCell } from "./format.js";

/** Renders a one-row section (legal / loan) as a label-value grid. */
function FieldGrid({ columns, rows }) {
  if (!rows?.length) return <p className="muted">No data.</p>;

  return rows.map((row, i) => (
    <dl className="fields" key={i}>
      {columns.map((c) => (
        <div className="field" key={c}>
          <dt>{LABELS[c] ?? c}</dt>
          <dd>{formatCell(c, row[c])}</dd>
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
              <th key={c}>{LABELS[c] ?? c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c}>{formatCell(c, row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CaseDetails({ caseId, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  // Close on Escape, and stop the page behind the modal from scrolling.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const client = details?.legal?.rows?.[0]?.clientname;

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Case ${caseId} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>Case {caseId}</h2>
            {client && <p className="subtitle">{client}</p>}
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {loading && <p className="muted">Loading case details…</p>}

          {error && (
            <div className="error">
              <strong>Could not load this case.</strong> {error}
            </div>
          )}

          {details && (
            <>
              <section>
                <h3>Legal</h3>
                <FieldGrid {...details.legal} />
              </section>

              <section>
                <h3>Loan</h3>
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
