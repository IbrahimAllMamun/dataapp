import { useCallback, useEffect, useState } from "react";
import CaseDetails from "./CaseDetails.jsx";
import { LABELS, formatCell } from "./format.js";

// Tab label -> the exact `nature_of_suit` value stored in litigation_cases.
const TABS = [
  { key: "NI", suit: "Negotiable Instrument Act (NI Act)" },
  { key: "ARA", suit: "Artha Rin Aine (ARA)" },
  { key: "ARAE", suit: "Artha Rin Aine Execution (ARAE)" },
];

const PAGE_SIZES = [25, 50, 100, 200];

export default function App() {
  const [tab, setTab] = useState(TABS[0]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [openCaseId, setOpenCaseId] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({
      suit: tab.suit,
      page: String(page),
      page_size: String(pageSize),
    });

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
        if (err.name === "AbortError") return; // superseded by a newer request
        setError(err.message);
        setData(null);
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [tab, page, pageSize]);

  const selectTab = useCallback((next) => {
    setTab(next);
    setPage(1); // page N of the old suit is meaningless for the new one
  }, []);

  const totalPages = data?.total_pages ?? 0;
  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Litigation Cases</h1>
          <p className="subtitle">{tab.suit}</p>
        </div>
        {data && (
          <span className="total">{data.total.toLocaleString()} cases</span>
        )}
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === tab.key}
            className={`tab${t.key === tab.key ? " active" : ""}`}
            onClick={() => selectTab(t)}
          >
            {t.key}
          </button>
        ))}
      </nav>

      {error && (
        <div className="error">
          <strong>Could not load cases.</strong> {error}
        </div>
      )}

      {!error && (
        <div className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{LABELS[c] ?? c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="muted center" colSpan={columns.length || 6}>
                      Loading…
                    </td>
                  </tr>
                )}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td className="muted center" colSpan={columns.length || 6}>
                      No cases for this suit type.
                    </td>
                  </tr>
                )}

                {!loading &&
                  rows.map((row) => (
                    <tr
                      key={row.caseid}
                      className="row-click"
                      tabIndex={0}
                      onClick={() => setOpenCaseId(row.caseid)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenCaseId(row.caseid);
                        }
                      }}
                    >
                      {columns.map((c) => (
                        <td key={c}>
                          {c === "litigationstatus" ? (
                            <span
                              className={`badge ${
                                row[c] === "Active" ? "active" : "inactive"
                              }`}
                            >
                              {formatCell(c, row[c])}
                            </span>
                          ) : (
                            formatCell(c, row[c])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <label className="page-size">
              Rows
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1); // offsets shift, so the old page number is stale
                }}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <div className="pager-nav">
              <button
                className="ghost"
                disabled={loading || page <= 1}
                onClick={() => setPage(1)}
              >
                « First
              </button>
              <button
                className="ghost"
                disabled={loading || page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹ Prev
              </button>
              <span className="page-info">
                Page {page.toLocaleString()} of{" "}
                {(totalPages || 1).toLocaleString()}
              </span>
              <button
                className="ghost"
                disabled={loading || page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next ›
              </button>
              <button
                className="ghost"
                disabled={loading || page >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                Last »
              </button>
            </div>
          </div>
        </div>
      )}

      {openCaseId !== null && (
        <CaseDetails caseId={openCaseId} onClose={() => setOpenCaseId(null)} />
      )}
    </div>
  );
}
