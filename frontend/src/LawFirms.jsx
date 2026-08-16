import { useLayoutEffect, useRef, useState } from "react";
import { ChevronIcon, EmptyIcon } from "./icons.jsx";

/** Whole numbers with separators; em dash for nothing. */
const num = (v) =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString();

/** The average on one line, its range beneath: min green, max red. */
function AgingCell({ avg, min, max }) {
  if (avg === null || avg === undefined) return <span className="muted">—</span>;

  return (
    <span className="aging">
      <span className="aging-avg">{num(avg)}</span>
      <span className="aging-range">
        (<span className="lo">{num(min)}</span>,{" "}
        <span className="hi">{num(max)}</span>)
      </span>
    </span>
  );
}

function AgingHeadCell() {
  return (
    <span className="aging">
      <span className="aging-avg">avg</span>
      <span className="aging-range">
        (<span className="lo">min</span>, <span className="hi">max</span>)
      </span>
    </span>
  );
}

const COLS = 5; // Group + four value columns

/**
 * Two levels from /api/law_firm, in the shape the Summary tab uses:
 *   level 0  a law firm      — click to expand
 *   level 1  one of its suit types — click for the cases behind it
 */
export default function LawFirms({ data, loading, onDrill }) {
  // Closed to begin with: the point of the tab is which firms carry the book,
  // not every firm's suit split at once.
  const [open, setOpen] = useState(() => new Set());
  const bodyRef = useRef(null);

  const toggle = (firm) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(firm) ? next.delete(firm) : next.add(firm);
      return next;
    });

  const rows = data?.rows ?? [];

  // Only the two header rows pin here, and only so the subheader parks under
  // the header instead of on top of it.
  //
  // The firm rows deliberately do NOT pin, unlike the summary's. The summary
  // stacks a bounded set — one grand total and four suit types — whereas this
  // list runs to ~70 firms. Pinning them all filled the viewport with parked
  // rows and the list stopped scrolling altogether: measured, the same 13 rows
  // were on screen at scrollTop 0 and at the very bottom.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    const stick = () => {
      // :scope > thead, so a nested table can never take a slot in the chain.
      const heads = [
        ...(body.parentElement?.querySelectorAll(":scope > thead > tr") ?? []),
      ];

      let offset = 0;
      heads.forEach((tr, i) => {
        // The sticky element is each cell, not the <tr> — a row cannot be a
        // sticky container itself — so both values travel down as variables.
        tr.style.setProperty("--stick-top", `${offset}px`);
        tr.style.setProperty("--stick-z", String(heads.length - i));
        offset += tr.getBoundingClientRect().height;
      });
    };

    stick();
    const ro = new ResizeObserver(stick);
    ro.observe(body);
    return () => ro.disconnect();
  }, [rows]);

  if (loading && !data) {
    return (
      <div className="panel summary-panel">
        <div className="table-scroll">
          <table className="summary firms">
            <tbody>
              {Array.from({ length: 10 }).map((_, r) => (
                <tr className="sk-row" key={r}>
                  {Array.from({ length: COLS }).map((_, c) => (
                    <td key={c}>
                      <span className="sk" style={{ "--sk-w": `${45 + ((c * 31) % 45)}%` }} />
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
          <strong>No law firms to show</strong>
          <span>No cases match the current filters.</span>
        </div>
      </div>
    );
  }

  // Suit rows belong to the firm above them.
  let currentFirm = null;
  const visible = rows.filter((r) => {
    if (r.level === 0) currentFirm = r.law_firm;
    return r.level !== 1 || open.has(currentFirm);
  });

  return (
    <div className="panel summary-panel">
      <div className="table-scroll">
        <table className="summary firms">
          <thead>
            <tr>
              <th className="grp">Law Firm</th>
              <th className="num">Cases</th>
              <th className="num">Suit Value</th>
              <th className="num">Receivable</th>
              <th className="num aging-col">Aging</th>
            </tr>
            <tr>
              <th className="grp"></th>
              <th className="num"></th>
              <th className="num"></th>
              <th className="num"></th>
              <th className="num aging-col">
                <AgingHeadCell />
              </th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {visible.map((r, i) => {
              const isFirm = r.level === 0;
              const expanded = isFirm && open.has(r.law_firm);

              // Firm rows reuse the summary's expandable-row treatment; their
              // suit rows reuse the drillable one. No sticky-row: see the
              // layout effect above.
              const cls = [
                isFirm ? "lvl-suit" : "lvl-status",
                expanded ? "is-open" : "",
              ]
                .filter(Boolean)
                .join(" ");

              const activate = isFirm
                ? () => toggle(r.law_firm)
                : () => onDrill?.(r.law_firm, r.suit_type);

              return (
                <tr
                  key={`${r.level}-${r.law_firm ?? ""}-${r.suit_type ?? ""}-${i}`}
                  className={cls}
                  tabIndex={0}
                  role="button"
                  aria-expanded={isFirm ? expanded : undefined}
                  onClick={activate}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      activate();
                    }
                  }}
                >
                  <td className="grp">
                    {/* The flex layout lives on this span, not the cell: a td
                        set to display:flex stops being a table cell and its
                        position:sticky stops working. */}
                    <span className="grp-label">
                      {isFirm && <ChevronIcon className="twisty" />}
                      {isFirm ? (r.law_firm ?? "—") : (r.suit_type ?? "—")}
                    </span>
                  </td>
                  <td className="num">{num(r.cases)}</td>
                  <td className="num">{num(r.total_suit_value)}</td>
                  <td className="num">{num(r.total_receivable)}</td>
                  <td className="num aging-col">
                    <AgingCell avg={r.avg_aging} min={r.min_aging} max={r.max_aging} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
