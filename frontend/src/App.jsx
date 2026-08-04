import { useEffect, useState } from "react";

export default function App() {
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const res = await fetch("/api/data");
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || "Failed to load data");
      }
      const data = await res.json();
      setColumns(data.columns);
      setRows(data.rows);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <header>
        <h1>Litigation Data</h1>
        <button onClick={loadData} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </header>

      {error && <p className="error">Error: {error}</p>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No data returned.</p>
      ) : (
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col}>{row[col] === null ? "—" : String(row[col])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
