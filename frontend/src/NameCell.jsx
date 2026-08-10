import { IDENTITY_PAIRS, LABELS, formatCell } from "./format.js";

/**
 * Renders a value, folding in its paired identifier as a badge when the column
 * has one — "Meghna Textiles Ltd. [90114500]".
 *
 * Safe to use for every cell: a column with no pair, or a row whose identifier
 * is missing, renders exactly as formatCell would on its own.
 */
export default function NameCell({ column, row }) {
  const name = formatCell(column, row[column]);
  const idColumn = IDENTITY_PAIRS[column];
  if (!idColumn) return name;

  const raw = row[idColumn];
  if (raw === null || raw === undefined || String(raw).trim() === "") return name;

  return (
    <span className="named">
      {name}
      {/* Tooltip names the column, since the badge itself shows only digits. */}
      <span className="badge cif" title={LABELS[idColumn] ?? idColumn}>
        {formatCell(idColumn, raw)}
      </span>
    </span>
  );
}
