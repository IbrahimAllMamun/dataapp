import { useCallback, useEffect, useRef, useState } from "react";
import CaseDetails from "./CaseDetails.jsx";
import Filters from "./Filters.jsx";
import { LABELS, formatCell, isNumericColumn } from "./format.js";
import { AlertIcon, EmptyIcon, MoonIcon, ScalesIcon, SunIcon } from "./icons.jsx";

// Tab label -> the exact `nature_of_suit` value stored in litigation_cases.
const TABS = [
  { key: "NI", suit: "Negotiable Instrument Act (NI Act)" },
  { key: "ARA", suit: "Artha Rin Aine (ARA)" },
  { key: "ARAE", suit: "Artha Rin Aine Execution (ARAE)" },
];

const PAGE_SIZES = [25, 50, 100, 200];

// Mirrors DEFAULTS in the API. One routine produces both the opening view and
// the "Clear all" view, so the two can never diverge.
const DEFAULT_FILTERS = {
  branch: "All",
  upcoming: "All",
  products: ["SME"],
  statuses: ["Active"],
  warrant: false,
  q: "",
};

const SKELETON_ROWS = 8;
const SKELETON_COLS = 6;

// Rows cascade in, but only the first dozen — beyond that the stagger stops
// reading as motion and starts reading as lag.
const STAGGER_MS = 22;
const STAGGER_CAP = 12;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Light/dark, persisted. index.html stamps the initial value before paint. */
function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute("data-theme") || "light"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* private mode — the in-memory value still works for this session */
    }
  }, [theme]);

  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

/** Eases a number toward its target so the case count doesn't just snap. */
function useCountUp(target, duration = 520) {
  const [display, setDisplay] = useState(target ?? 0);
  const fromRef = useRef(target ?? 0);

  useEffect(() => {
    if (typeof target !== "number") return;
    if (prefersReducedMotion()) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) return;

    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(from + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

export default function App() {
  const [theme, toggleTheme] = useTheme();

  const [tab, setTab] = useState(TABS[0]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [openCaseId, setOpenCaseId] = useState(null);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const scrollRef = useRef(null);

  // The single reset routine — used for "Clear all" AND on suit change.
  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const changeFilters = useCallback((next) => {
    setFilters(next);
    setPage(1); // any filter change invalidates the current page offset
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({
      suit: tab.suit,
      page: String(page),
      page_size: String(pageSize),
    });
    if (filters.branch && filters.branch !== "All") qs.set("branch", filters.branch);
    if (filters.upcoming && filters.upcoming !== "All") qs.set("upcoming", filters.upcoming);
    if (filters.warrant) qs.set("warrant", "true");
    if (filters.q) qs.set("q", filters.q);
    // Repeated keys -> FastAPI list params.
    filters.products.forEach((p) => qs.append("products", p));
    filters.statuses.forEach((s) => qs.append("statuses", s));

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
  }, [tab, page, pageSize, filters]);

  const selectTab = useCallback((next) => {
    setTab(next);
    setPage(1); // page N of the old suit is meaningless for the new one
  }, []);

  // A new page starts at the top of the table, not wherever the last one ended.
  const goToPage = useCallback((next) => {
    setPage(next);
    scrollRef.current?.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, []);

  const totalPages = data?.total_pages ?? 0;
  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];
  const tabIndex = TABS.findIndex((t) => t.key === tab.key);
  const animatedTotal = useCountUp(data?.total);

  // First load has nothing to show yet; later loads keep the previous page on
  // screen (dimmed, with a progress bar) rather than blanking the table.
  const showSkeleton = loading && !data;
  const refreshing = loading && !!data;

  // Changing this remounts <tbody>, which restarts the row cascade.
  const bodyKey = `${tab.key}|${page}|${pageSize}|${data?.total ?? "-"}`;

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand">
          <div className="brand-mark">
            <ScalesIcon />
          </div>
          <div>
            <h1>Litigation Cases</h1>
            <p className="subtitle">{tab.suit}</p>
          </div>
        </div>

        <div className="masthead-actions">
          {data && (
            <span className="total">
              <b>{animatedTotal.toLocaleString()}</b> cases
            </span>
          )}
          <button
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            <span className="theme-icon">
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </span>
          </button>
        </div>
      </header>

      <nav
        className="tabs"
        role="tablist"
        style={{ "--tab-count": TABS.length, "--tab-index": Math.max(tabIndex, 0) }}
      >
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

      <Filters
        suit={tab.suit}
        value={filters}
        onChange={changeFilters}
        onClear={clearFilters}
        total={data?.total}
      />

      {error && (
        <div className="error" role="alert">
          <AlertIcon />
          <div>
            <strong>Could not load cases.</strong> {error}
          </div>
        </div>
      )}

      {!error && (
        <div className="panel">
          {refreshing && <div className="loadbar" role="status" aria-label="Loading" />}

          <div
            className="table-scroll"
            ref={scrollRef}
            style={{
              opacity: refreshing ? 0.55 : 1,
              transition: "opacity 160ms var(--ease)",
            }}
          >
            <table>
              <thead>
                <tr>
                  {(columns.length ? columns : Array.from({ length: SKELETON_COLS })).map(
                    (c, i) => (
                      <th key={c ?? i} className={c && isNumericColumn(c) ? "num" : undefined}>
                        {c ? LABELS[c] ?? c : " "}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody key={bodyKey}>
                {showSkeleton &&
                  Array.from({ length: SKELETON_ROWS }).map((_, r) => (
                    <tr className="sk-row" key={r}>
                      {Array.from({ length: columns.length || SKELETON_COLS }).map((_, c) => (
                        <td key={c}>
                          {/* varied widths so the placeholder reads as data, not bars */}
                          <span className="sk" style={{ "--sk-w": `${45 + ((c * 37) % 45)}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))}

                {!showSkeleton && rows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length || SKELETON_COLS}>
                      <div className="empty">
                        <EmptyIcon />
                        <strong>No matching cases</strong>
                        <span>Try widening the filters or clearing the search.</span>
                      </div>
                    </td>
                  </tr>
                )}

                {!showSkeleton &&
                  rows.map((row, i) => (
                    <tr
                      key={row.caseid}
                      className="row-click row-in"
                      style={{ animationDelay: `${Math.min(i, STAGGER_CAP) * STAGGER_MS}ms` }}
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
                        <td key={c} className={isNumericColumn(c) ? "num" : undefined}>
                          {c === "litigationstatus" ? (
                            <span
                              className={`badge ${row[c] === "Active" ? "active" : "inactive"}`}
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
              <button className="ghost" disabled={loading || page <= 1} onClick={() => goToPage(1)}>
                « First
              </button>
              <button
                className="ghost"
                disabled={loading || page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                ‹ Prev
              </button>
              <span className="page-info">
                Page <b>{page.toLocaleString()}</b> of {(totalPages || 1).toLocaleString()}
              </span>
              <button
                className="ghost"
                disabled={loading || page >= totalPages}
                onClick={() => goToPage(page + 1)}
              >
                Next ›
              </button>
              <button
                className="ghost"
                disabled={loading || page >= totalPages}
                onClick={() => goToPage(totalPages)}
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
