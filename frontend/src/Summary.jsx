import { useLayoutEffect, useRef, useState } from "react";
import { ChevronIcon, EmptyIcon } from "./icons.jsx";

/** Whole numbers with separators; em dash for nothing. */
const num = (v) =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString();

/**
 * The average on one line, its range beneath: min green, max red.
 * A group with no qualifying case renders a single em dash rather than a
 * fabricated zero.
 */
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
      <span className="aging-avg">{"avg"}</span>
      <span className="aging-range">
        (<span className="lo">{"min"}</span>,{" "}
        <span className="hi">{"max"}</span>)
      </span>
    </span>
  );
}

const COLS = 6; // value columns, excluding Group

export default function Summary({ data, loading, filters, onDrill }) {
  // Suit types start closed: the point of the tab is the shape of the whole
  // book, not 139 status rows at once.
  const [open, setOpen] = useState(() => new Set());

  const bodyRef = useRef(null);

  const toggle = (suit) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(suit) ? next.delete(suit) : next.add(suit);
      return next;
    });

  const rows = data?.rows ?? [];

  // Each sticky row parks below the ones above it rather than on top of them.
  // Heights vary (two-line aging cells, wrapped labels), so they are measured
  // rather than assumed, and re-measured whenever the visible set changes.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    const stick = () => {
      // The column header is sticky at 0, so the chain starts below it —
      // otherwise the grand total parks on top of the header.
      const head = body.parentElement?.querySelector("thead");
      let offset = head ? head.getBoundingClientRect().height : 0;

      for (const tr of body.querySelectorAll("tr.sticky-row")) {
        // The sticky element is each <td>, not the <tr> — a table row cannot be
        // a sticky container itself — so the offset travels down as a variable.
        tr.style.setProperty("--stick-top", `${offset}px`);
        offset += tr.getBoundingClientRect().height;
      }
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
              {Array.from({ length: 10 }).map((_, r) => (
                <tr className="sk-row" key={r}>
                  {Array.from({ length: COLS + 1 }).map((_, c) => (
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
          <strong>Nothing to summarise</strong>
          <span>No cases match the current filters.</span>
        </div>
      </div>
    );
  }

  // Status rows belong to the suit above them.
  let currentSuit = null;
  const visible = rows.filter((r) => {
    if (r.level === 1) currentSuit = r.suit_type;
    return r.level !== 2 || open.has(currentSuit);
  });

  return (
    <div className="panel summary-panel">
      <div className="table-scroll">
        <table className="summary">
          <thead>
            <tr>
              <th className="grp">Group</th>
              <th className="num">Cases</th>
              <th className="num">Suit Value</th>
              <th className="num">Receivable</th>
              <th className="num">Overdue</th>
              <th className="num aging-col">Aging</th>
              <th className="num aging-col">Status Duration</th>
            </tr>
            <tr>
              <th className="grp"></th>
              <th className="num"></th>
              <th className="num"></th>
              <th className="num"></th>
              <th className="num"></th>
              <th className="num aging-col"><AgingHeadCell/></th>
              <th className="num aging-col"><AgingHeadCell/></th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {visible.map((r, i) => {
              const isTotal = r.level === 0;
              const isSuit = r.level === 1;
              const expanded = isSuit && open.has(r.suit_type);

              // Both the total and the suit rows pin, in document order.
              const cls = [
                isTotal ? "lvl-total" : isSuit ? "lvl-suit" : "lvl-status",
                isTotal || isSuit ? "sticky-row" : "",
                expanded ? "is-open" : "",
              ]
                .filter(Boolean)
                .join(" ");

              const activate = isSuit
                ? () => toggle(r.suit_type)
                : r.level === 2
                  ? () => onDrill?.(r.suit_type, r.present_case_status)
                  : undefined;

              return (
                <tr
                  key={`${r.level}-${r.suit_type ?? ""}-${r.present_case_status ?? ""}-${i}`}
                  className={cls}
                  tabIndex={activate ? 0 : undefined}
                  role={activate ? "button" : undefined}
                  aria-expanded={isSuit ? expanded : undefined}
                  onClick={activate}
                  onKeyDown={
                    activate
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            activate();
                          }
                        }
                      : undefined
                  }
                >
                  <td className="grp">
                    {/* The flex layout lives on this span, not the cell: a td
                        set to display:flex stops being a table cell and its
                        position:sticky stops working. */}
                    <span className="grp-label">
                      {isSuit && <ChevronIcon className="twisty" />}
                      {isTotal
                        ? "Grand Total"
                        : isSuit
                          ? (r.suit_type ?? "—")
                          : (r.present_case_status ?? "—")}
                    </span>
                  </td>
                  <td className="num">{num(r.cases)}</td>
                  <td className="num">{num(r.total_suit_value)}</td>
                  <td className="num">{num(r.total_receivable)}</td>
                  <td className="num">{num(r.total_overdue)}</td>
                  <td className="num aging-col">
                    <AgingCell avg={r.avg_aging} min={r.min_aging} max={r.max_aging} />
                  </td>
                  <td className="num aging-col">
                    <AgingCell
                      avg={r.avg_aging_status}
                      min={r.min_aging_status}
                      max={r.max_aging_status}
                    />
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
