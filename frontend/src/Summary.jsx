import { EmptyIcon } from "./icons.jsx";

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

const LEVEL_CLASS = ["lvl-total", "lvl-suit", "lvl-status"];

export default function Summary({ data, loading }) {
  if (loading && !data) {
    return (
      <div className="panel summary-panel">
        <div className="table-scroll">
          <table className="summary">
            <tbody>
              {Array.from({ length: 10 }).map((_, r) => (
                <tr className="sk-row" key={r}>
                  {Array.from({ length: 8 }).map((_, c) => (
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

  const rows = data?.rows ?? [];

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
              <th className="num">Case Aging</th>
              <th className="num">Since Last Hearing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={LEVEL_CLASS[r.level] ?? "lvl-status"}>
                <td className="grp">
                  {r.level === 0
                    ? "Grand Total"
                    : r.level === 1
                      ? r.suit_type ?? "—"
                      : r.present_case_status ?? "—"}
                </td>
                <td className="num">{num(r.cases)}</td>
                <td className="num">{num(r.total_suit_value)}</td>
                <td className="num">{num(r.total_receivable)}</td>
                <td className="num">{num(r.total_overdue)}</td>
                <td className="num">
                  <AgingCell avg={r.avg_aging} min={r.min_aging} max={r.max_aging} />
                </td>
                <td className="num">
                  <AgingCell
                    avg={r.avg_aging_status}
                    min={r.min_aging_status}
                    max={r.max_aging_status}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
