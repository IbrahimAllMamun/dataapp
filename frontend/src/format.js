// Column name -> human label. Anything missing falls back to the raw key.
export const LABELS = {
  caseid: "CaseID",
  cif: "CIF",
  clientname: "Client Name",
  accountnumber: "Account Number",
  branch: "Branch",
  nature_of_suit: "Suit",
  suit_value: "Suit Value",
  suit_filing_date: "Suit Filing Date",
  law_firm: "Law Firm",
  court_no: "Court No",
  plaintiff: "Plaintiff",
  plaintiffcif: "Plaintiff CIF",
  next_hearing_date: "Next Hearing Date",
  cheque_number: "Cheque Number",
  litigation_receivable: "Receivable",
  aging: "Aging",
  present_case_status: "Present Case Status",
  litigationstatus: "Litigation Status",

  product_category: "Product Category",
  stmcode: "STM Code",
  stmname: "STM Name",
  rmcode: "RM Code",
  rmname: "RM Name",
  monitorbycode: "Monitor By Code",
  monitorby: "Monitor By",
  urpa: "URPA",
  mod: "MOD",
  overdue_amount: "Overdue Amount",
  principal_od: "Principal OD",
  interest_od: "Interest OD",
  lpi: "LPI",
  netexcisedutytilllastyear: "Net Excise Duty (Last Year)",
  netexcisedutytillcurrentyear: "Net Excise Duty (Current Year)",
  hearing_date: "Hearing Date",
  case_status: "Case Status",
  makedate: "Make Date",
};

// Amounts get thousands separators + 2 decimals; everything else stays as-is.
const MONEY = new Set([
  "litigation_receivable",
  "suit_value",
  "urpa",
  "overdue_amount",
  "principal_od",
  "interest_od",
  "lpi",
  "netexcisedutytilllastyear",
  "netexcisedutytillcurrentyear",
]);

// Identifiers are numeric in the DB but must never get thousands separators.
const IDS = new Set([
  "caseid", "cif", "plaintiffcif", "stmcode", "rmcode", "monitorbycode",
]);

// Name column -> the identifier that belongs beside it. The identifier is
// folded into the name's cell as a badge rather than taking a column of its
// own, so "Meghna Textiles Ltd." and its CIF read as one fact.
export const IDENTITY_PAIRS = {
  clientname: "cif",
  plaintiff: "plaintiffcif",
  stmname: "stmcode",
  rmname: "rmcode",
  monitorby: "monitorbycode",
};

/**
 * Drops each identifier column that has been folded into a name column.
 * An identifier is only dropped when its name column is actually present —
 * otherwise it is the only carrier of that value and must keep its column.
 */
export function mergeIdentityColumns(columns) {
  const folded = new Set(
    Object.entries(IDENTITY_PAIRS)
      .filter(([name]) => columns.includes(name))
      .map(([, id]) => id)
  );
  return columns.filter((c) => !folded.has(c));
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// Columns that should render right-aligned in a tabular-numerals font, so
// digits line up column-wise instead of jittering as pages change.
export function isNumericColumn(column) {
  return MONEY.has(column) || column === "aging" || column === "court_no";
}

export function formatCell(column, value) {
  if (value === null || value === undefined || value === "") return "—";

  if (IDS.has(column)) return String(value).trim();

  if (MONEY.has(column) && typeof value === "number") {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (typeof value === "string" && ISO_DATETIME.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      // makedate carries a real time-of-day; the date-only fields are midnight.
      const datePart = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
      // const hasTime = d.getHours() || d.getMinutes() || d.getSeconds();
      return datePart;
    }
  }

  // Fixed-width CHAR columns from SQL Server arrive padded (e.g. account numbers).
  if (typeof value === "string") return value.trim() || "—";

  if (typeof value === "number") return value.toLocaleString();

  return String(value);
}
