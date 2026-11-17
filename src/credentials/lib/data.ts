import Papa from "papaparse";
import { EMPTY_MAPPING, FIELDS, type FieldKey, type Mapping, type User } from "./fields";

export type Rows = string[][];

/**
 * Parse CSV/TSV text. The delimiter is auto-detected so that content copied
 * from a spreadsheet (tab separated) works the same as a CSV file.
 */
export function parseTable(text: string): Rows {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    delimiter: "",
    delimitersToGuess: ["\t", ",", ";", "|"],
    skipEmptyLines: "greedy",
  });
  if (result.data.length === 0) {
    const err = result.errors[0];
    throw new Error(err ? err.message : "No rows found");
  }
  const width = Math.max(...result.data.map((r) => r.length));
  return result.data.map((r) => {
    const row = r.map((c) => (c ?? "").toString());
    while (row.length < width) row.push("");
    return row;
  });
}

export function normalizeHeader(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldForHeader(header: string): FieldKey | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  for (const f of FIELDS) if (f.aliases.includes(h)) return f.key;
  return null;
}

/** Guess whether the first row is a header row. */
export function detectHeader(rows: Rows): boolean {
  if (rows.length === 0) return false;
  const first = rows[0];
  const known = first.filter((c) => fieldForHeader(c) !== null).length;
  if (known >= 2) return true;
  if (known === 1 && rows.length > 1) {
    // A single recognised name plus no digits/@ in the row looks like a header.
    return first.every((c) => !/[@\d]/.test(c));
  }
  return false;
}

/**
 * Suggest a mapping. With a header row, columns are matched by name; without
 * one, columns are assigned in the TUI's positional order
 * (username, password, first names, last names, site).
 */
export function autoMap(rows: Rows, hasHeader: boolean): Mapping {
  const mapping: Mapping = { ...EMPTY_MAPPING };
  const ncols = rows[0]?.length ?? 0;
  if (hasHeader) {
    rows[0].forEach((h, i) => {
      const key = fieldForHeader(h);
      if (key && mapping[key] === null) mapping[key] = i;
    });
  } else {
    FIELDS.forEach((f, i) => {
      if (i < ncols) mapping[f.key] = i;
    });
  }
  return mapping;
}

export function columnNames(rows: Rows, hasHeader: boolean): string[] {
  const ncols = rows[0]?.length ?? 0;
  return Array.from({ length: ncols }, (_, i) => {
    const h = hasHeader ? rows[0][i]?.trim() : "";
    return h || `Column ${i + 1}`;
  });
}

export function dataRows(rows: Rows, hasHeader: boolean): Rows {
  return hasHeader ? rows.slice(1) : rows;
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

export function toUsers(rows: Rows, mapping: Mapping): User[] {
  const get = (row: string[], k: FieldKey) => {
    const i = mapping[k];
    return i === null ? "" : clean(row[i]);
  };
  return rows
    .map((row) => ({
      username: get(row, "username"),
      password: get(row, "password"),
      firstName: get(row, "firstName"),
      lastName: get(row, "lastName"),
      site: get(row, "site"),
    }))
    .filter((u) => u.username || u.password || u.firstName || u.lastName);
}

/** Group users by site, keeping the order in which sites first appear. */
export function groupBySite(users: User[]): Map<string, User[]> {
  const groups = new Map<string, User[]>();
  for (const u of users) {
    const site = u.site || "No site";
    const list = groups.get(site);
    if (list) list.push(u);
    else groups.set(site, [u]);
  }
  return groups;
}

/** Equivalent of Python's `str.title()`. */
export function titleCase(s: string): string {
  let out = "";
  let prevIsLetter = false;
  for (const ch of s) {
    const isLetter = ch.toLowerCase() !== ch.toUpperCase();
    out += isLetter ? (prevIsLetter ? ch.toLowerCase() : ch.toUpperCase()) : ch;
    prevIsLetter = isLetter;
  }
  return out;
}

/** Make a string safe to use as a file name. */
export function safeFileName(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim() || "credentials";
}
