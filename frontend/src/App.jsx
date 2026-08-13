import { useCallback, useEffect, useRef, useState } from "react";
import CaseDetails from "./CaseDetails.jsx";
import Filters from "./Filters.jsx";
import NameCell from "./NameCell.jsx";
import Summary from "./Summary.jsx";
import CaseListModal from "./CaseListModal.jsx";
import Errors from "./Errors.jsx";
import {
  LABELS,
  formatCell,
  formatDate,
  isNumericColumn,
  mergeIdentityColumns,
} from "./format.js";
import {
  AlertIcon,
  CloseIcon,
  EmptyIcon,
  FilterIcon,
  MoonIcon,
  ScalesIcon,
  SunIcon,
} from "./icons.jsx";

// Tab label -> the `suit_type` value derived in derive.py (SUIT_TYPES), not the
// raw nature_of_suit. "Others" covers several source values at once.
const TABS = [
  // Not a suit: shows aggregates across all of them.
  { key: "Summary", summary: true },
  { key: "NI", suit: "NI Act" },
  { key: "ARA", suit: "ARA" },
  { key: "ARAE", suit: "ARAE" },
  { key: "Others", suit: "Others" },
  // Data-quality exceptions, not a suit.
  { key: "Errors", errors: true },
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
    () => document.documentElement.getAttribute("data-theme") || "light",
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

export default function App() {
  const [theme, toggleTheme] = useTheme();

  const [tab, setTab] = useState(TABS[0]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [data, setData] = useState(null);
  const [reportdate, setReportdate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [openCaseId, setOpenCaseId] = useState(null);

  // Summary drill-down: {suit, caseStatus}. Sits under CaseDetails, so closing
  // a case returns to the list rather than all the way to the summary.
  const [drill, setDrill] = useState(null);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  // Only meaningful below the sidebar breakpoint, where the filters become an
  // off-canvas drawer. Above it the sidebar is always in the layout.
  const [drawerOpen, setDrawerOpen] = useState(false);

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

    // The summary spans every suit and aggregates, so it takes neither the
    // suit nor the paging, and drops the two per-case filters.
    if (tab.errors) {
      const eq = new URLSearchParams();
      if (filters.branch && filters.branch !== "All")
        eq.set("branch", filters.branch);
      filters.products.forEach((p) => eq.append("products", p));

      fetch(`/api/error_summary?${eq}`, { signal: ctrl.signal })
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          if (!res.ok)
            throw new Error(body?.detail || `Request failed (${res.status})`);
          return body;
        })
        .then((body) => {
          setData(body);
          setLoading(false);
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setError(err.message);
          setData(null);
          setLoading(false);
        });

      return () => ctrl.abort();
    }

    if (tab.summary) {
      const sq = new URLSearchParams();
      if (filters.branch && filters.branch !== "All")
        sq.set("branch", filters.branch);
      if (filters.upcoming && filters.upcoming !== "All")
        sq.set("upcoming", filters.upcoming);
      filters.products.forEach((p) => sq.append("products", p));
      filters.statuses.forEach((s) => sq.append("statuses", s));

      fetch(`/api/summary?${sq}`, { signal: ctrl.signal })
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          if (!res.ok)
            throw new Error(body?.detail || `Request failed (${res.status})`);
          return body;
        })
        .then((body) => {
          setData(body);
          setLoading(false);
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setError(err.message);
          setData(null);
          setLoading(false);
        });

      return () => ctrl.abort();
    }

    const qs = new URLSearchParams({
      suit: tab.suit,
      page: String(page),
      page_size: String(pageSize),
    });
    if (filters.branch && filters.branch !== "All")
      qs.set("branch", filters.branch);
    if (filters.upcoming && filters.upcoming !== "All")
      qs.set("upcoming", filters.upcoming);
    if (filters.warrant) qs.set("warrant", "true");
    if (filters.q) qs.set("q", filters.q);
    // Repeated keys -> FastAPI list params.
    filters.products.forEach((p) => qs.append("products", p));
    filters.statuses.forEach((s) => qs.append("statuses", s));

    fetch(`/api/cases?${qs}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok)
          throw new Error(body?.detail || `Request failed (${res.status})`);
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

  // The report date describes the warehouse as a whole, so it neither depends
  // on the filters nor belongs to the table's loading/error state — a failure
  // here just hides the pill instead of blanking the table.
  useEffect(() => {
    const ctrl = new AbortController();

    fetch("/api/reportdate", { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok)
          throw new Error(body?.detail || `Request failed (${res.status})`);
        return body;
      })
      .then((body) => setReportdate(body.reportdate))
      .catch((err) => {
        if (err.name === "AbortError") return;
        // Metadata only, so this never blanks the table — but it has to say
        // something, or a broken endpoint looks identical to "no date yet".
        console.warn("Could not load the report date:", err.message);
      });

    return () => ctrl.abort();
  }, []);

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
  // Identifier columns are folded into their name column's cell, so they must
  // not also get a column of their own.
  const columns = mergeIdentityColumns(data?.columns ?? []);
  const rows = data?.rows ?? [];
  const tabIndex = TABS.findIndex((t) => t.key === tab.key);

  // First load has nothing to show yet; later loads keep the previous page on
  // screen (dimmed, with a progress bar) rather than blanking the table.
  const showSkeleton = loading && !data;
  const refreshing = loading && !!data;

  // Changing this remounts <tbody>, which restarts the row cascade.
  const bodyKey = `${tab.key}|${page}|${pageSize}|${data?.total ?? "-"}`;

  // Escape closes the filter drawer, and the page behind it stays put while
  // it is open. Neither applies above the breakpoint, where it is never open.
  useEffect(() => {
    if (!drawerOpen) return;

    const onKey = (e) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            {/* Drawer control. CSS hides it above the sidebar breakpoint. */}
            <button
              className="icon-btn filter-toggle"
              onClick={() => setDrawerOpen(true)}
              aria-label="Show filters"
              aria-expanded={drawerOpen}
              title="Show filters"
            >
              <FilterIcon />
            </button>

            <div className="brand">
              <div className="brand-mark">
                <ScalesIcon />
              </div>
              <h1>Litigation Cases</h1>
            </div>
          </div>

          <nav
            className="tabs"
            role="tablist"
            aria-label="Suit type"
            style={{
              "--tab-count": TABS.length,
              "--tab-index": Math.max(tabIndex, 0),
            }}
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

          <div className="topbar-right">
            {reportdate && (
              <span className="total" title="The date this data was extracted">
                Report date <b>{formatDate(reportdate)}</b>
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
        </div>
      </header>

      <div className="wrap">
        <div className="layout">
          {drawerOpen && (
            <div
              className="drawer-backdrop"
              onClick={() => setDrawerOpen(false)}
            />
          )}

          <aside
            className={`sidebar${drawerOpen ? " open" : ""}`}
            aria-label="Filters"
          >
            <div className="sidebar-head">
              <h2>Filters</h2>
              <button
                className="icon-btn drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Hide filters"
              >
                <CloseIcon />
              </button>
            </div>

            <Filters
              suit={tab.suit}
              value={filters}
              onChange={changeFilters}
              onClear={clearFilters}
              total={tab.summary || tab.errors ? undefined : data?.total}
              // Each tab asks only for the controls it can actually apply.
              show={
                tab.errors
                  ? {
                      upcoming: false,
                      search: false,
                      statuses: false,
                      warrant: false,
                    }
                  : tab.summary
                    ? { search: false, warrant: false }
                    : undefined
              }
            />
          </aside>

          <main className="content">
            {error && (
              <div className="error" role="alert">
                <AlertIcon />
                <div>
                  <strong>Could not load cases.</strong> {error}
                </div>
              </div>
            )}

            {!error && tab.errors && (
              <Errors
                data={data}
                loading={loading}
                filters={filters}
                onPick={(caseid) => setOpenCaseId(caseid)}
              />
            )}

            {!error && tab.summary && (
              <Summary
                data={data}
                loading={loading}
                filters={filters}
                onDrill={(suit, caseStatus) => setDrill({ suit, caseStatus })}
              />
            )}

            {!error && !tab.summary && !tab.errors && (
              <div className="panel">
                {refreshing && (
                  <div className="loadbar" role="status" aria-label="Loading" />
                )}

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
                        {(columns.length
                          ? columns
                          : Array.from({ length: SKELETON_COLS })
                        ).map((c, i) => (
                          <th
                            key={c ?? i}
                            className={
                              c && isNumericColumn(c) ? "num" : undefined
                            }
                          >
                            {c ? (LABELS[c] ?? c) : " "}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody key={bodyKey}>
                      {showSkeleton &&
                        Array.from({ length: SKELETON_ROWS }).map((_, r) => (
                          <tr className="sk-row" key={r}>
                            {Array.from({
                              length: columns.length || SKELETON_COLS,
                            }).map((_, c) => (
                              <td key={c}>
                                {/* varied widths so the placeholder reads as data, not bars */}
                                <span
                                  className="sk"
                                  style={{
                                    "--sk-w": `${45 + ((c * 37) % 45)}%`,
                                  }}
                                />
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
                              <span>
                                Try widening the filters or clearing the search.
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}

                      {!showSkeleton &&
                        rows.map((row, i) => (
                          <tr
                            key={row.caseid}
                            className="row-click row-in"
                            style={{
                              animationDelay: `${Math.min(i, STAGGER_CAP) * STAGGER_MS}ms`,
                            }}
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
                              <td
                                key={c}
                                className={
                                  isNumericColumn(c) ? "num" : undefined
                                }
                              >
                                {c === "litigationstatus" ? (
                                  <span
                                    className={`badge ${row[c] === "Active" ? "active" : "inactive"}`}
                                  >
                                    {formatCell(c, row[c])}
                                  </span>
                                ) : (
                                  <NameCell column={c} row={row} />
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
                      onClick={() => goToPage(1)}
                    >
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
                      Page <b>{page.toLocaleString()}</b> of{" "}
                      {(totalPages || 1).toLocaleString()}
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
          </main>
        </div>
      </div>

      {drill && (
        <CaseListModal
          suit={drill.suit}
          caseStatus={drill.caseStatus}
          filters={filters}
          onPick={(caseid) => setOpenCaseId(caseid)}
          onClose={() => setDrill(null)}
          suspended={openCaseId !== null}
        />
      )}

      {openCaseId !== null && (
        <CaseDetails caseId={openCaseId} onClose={() => setOpenCaseId(null)} />
      )}
    </div>
  );
}
