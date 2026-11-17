import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { InputPanel } from "./components/InputPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ColumnMapper } from "./components/ColumnMapper";
import { EMPTY_MAPPING, FIELDS, requiredFields, type Mapping } from "./lib/fields";
import {
  autoMap,
  columnNames,
  dataRows,
  detectHeader,
  groupBySite,
  parseTable,
  safeFileName,
  titleCase,
  toUsers,
  type Rows,
} from "./lib/data";

// Heavy libraries (jsPDF, pdf.js, JSZip) are loaded on demand.
const PdfViewer = lazy(() => import("./components/PdfViewer").then((m) => ({ default: m.PdfViewer })));
const loadPdfLib = () => import("./lib/pdf");

interface GeneratedPdf {
  name: string;
  count: number;
  bytes: Uint8Array;
}

const PHASES = ["Regional", "Final"];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [rows, setRows] = useState<Rows | null>(null);
  const [source, setSource] = useState("");
  const [hasHeader, setHasHeader] = useState(false);
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [groupSites, setGroupSites] = useState(true);
  const [phaseName, setPhaseName] = useState(PHASES[0]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pdfs, setPdfs] = useState<GeneratedPdf[] | null>(null);
  const [current, setCurrent] = useState(0);

  const phase = `${phaseName} ${year}`.trim();

  // Warm up the font/logo download while the user maps columns.
  useEffect(() => {
    if (rows) void loadPdfLib().then((m) => m.loadAssets()).catch(() => {});
  }, [rows]);

  const loadText = (text: string, from: string) => {
    try {
      const parsed = parseTable(text);
      const header = detectHeader(parsed);
      setRows(parsed);
      setSource(from);
      setHasHeader(header);
      setMapping(autoMap(parsed, header));
      setPdfs(null);
      setError(null);
    } catch (e) {
      setError(`Error loading data: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Paste anywhere on the page (outside of form fields) loads the data, like the TUI.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const text = e.clipboardData?.getData("text/plain");
      if (text?.trim()) {
        e.preventDefault();
        loadText(text, "pasted text");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const columns = useMemo(() => (rows ? columnNames(rows, hasHeader) : []), [rows, hasHeader]);
  const body = useMemo(() => (rows ? dataRows(rows, hasHeader) : []), [rows, hasHeader]);
  const samples = useMemo(
    () =>
      columns.map((_, i) =>
        body
          .map((r) => r[i]?.trim() ?? "")
          .filter(Boolean)
          .slice(0, 3),
      ),
    [columns, body],
  );
  const required = requiredFields(groupSites);
  const missing = FIELDS.filter((f) => required.includes(f.key) && mapping[f.key] === null);
  const users = useMemo(() => toUsers(body, mapping), [body, mapping]);
  const groups = useMemo(
    () => (groupSites ? groupBySite(users) : new Map([[phase, users]])),
    [groupSites, users, phase],
  );

  // Any change to the inputs makes previously generated PDFs stale.
  useEffect(() => setPdfs(null), [rows, hasHeader, mapping, groupSites, phase]);

  const toggleHeader = (value: boolean) => {
    setHasHeader(value);
    if (rows) setMapping(autoMap(rows, value));
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { generatePdf } = await loadPdfLib();
      const out: GeneratedPdf[] = [];
      for (const [name, list] of groups) {
        out.push({ name, count: list.length, bytes: await generatePdf(phase, list) });
        // jsPDF blocks the main thread; yield so the UI stays responsive.
        await new Promise((r) => setTimeout(r, 0));
      }
      setPdfs(out);
      setCurrent(0);
    } catch (e) {
      setError(`Error generating PDFs: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  const downloadOne = (p: GeneratedPdf) =>
    downloadBlob(new Blob([p.bytes as BlobPart], { type: "application/pdf" }), `${safeFileName(p.name)}.pdf`);

  const downloadAll = async () => {
    if (!pdfs) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const used = new Set<string>();
    for (const p of pdfs) {
      let name = `${safeFileName(p.name)}.pdf`;
      for (let i = 2; used.has(name); i++) name = `${safeFileName(p.name)} (${i}).pdf`;
      used.add(name);
      zip.file(name, p.bytes);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `credentials ${safeFileName(phase)}.zip`);
  };

  const canGenerate = rows !== null && missing.length === 0 && users.length > 0;
  const selected = pdfs?.[current];

  return (
    <div className="app">
      <header className="topbar">
        <h1>Credentials</h1>
        <span className="muted">Generate printable OCI login credentials from a CSV. Everything runs in your browser.</span>
      </header>

      {error && (
        <div className="error" role="alert">
          {error}
          <button className="link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <section className="step">
        <h2>
          <span className="num">1</span> Load data
        </h2>
        {rows && (
          <p className="muted">
            Loaded {body.length} {body.length === 1 ? "row" : "rows"} and {columns.length} columns from {source}.
          </p>
        )}
        <InputPanel onText={loadText} compact={rows !== null} />
      </section>

      {rows && (
        <section className="step">
          <h2>
            <span className="num">2</span> Match columns
          </h2>
          <label className="check">
            <input type="checkbox" checked={hasHeader} onChange={(e) => toggleHeader(e.target.checked)} />
            First row is a header
          </label>
          <ColumnMapper columns={columns} samples={samples} mapping={mapping} required={required} onChange={setMapping} />

          {missing.length === 0 && users.length > 0 && (
            <details className="data-preview">
              <summary>
                Check data ({users.length} {users.length === 1 ? "credential" : "credentials"})
              </summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Username</th>
                      <th>Password</th>
                      {groupSites && <th>Site</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={i}>
                        <td>{titleCase(`${u.firstName} ${u.lastName}`.trim())}</td>
                        <td className="mono">{u.username}</td>
                        <td className="mono">{u.password}</td>
                        {groupSites && <td>{u.site}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>
      )}

      {rows && (
        <section className="step">
          <h2>
            <span className="num">3</span> Options
          </h2>
          <div className="options">
            <label>
              Phase
              <select value={phaseName} onChange={(e) => setPhaseName(e.target.value)}>
                {PHASES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Year
              <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" size={6} />
            </label>
            <label className="check">
              <input type="checkbox" checked={groupSites} onChange={(e) => setGroupSites(e.target.checked)} />
              One PDF per site
            </label>
            {/* The label stays in place (invisible) while busy so the button keeps its size. */}
            <button
              className="primary busy-button"
              disabled={!canGenerate}
              aria-busy={generating}
              aria-disabled={generating || undefined}
              onClick={() => {
                if (!generating) void generate();
              }}
            >
              <span className="label">{groupSites ? `Generate ${groups.size} PDFs` : "Generate PDF"}</span>
              {generating && <span className="spinner" aria-hidden />}
            </button>
            <span className="visually-hidden" role="status">
              {generating ? "Generating PDFs…" : pdfs ? "PDFs ready" : ""}
            </span>
          </div>
          {missing.length > 0 && (
            <p className="muted">Assign a column to: {missing.map((f) => f.label).join(", ")}.</p>
          )}
        </section>
      )}

      {pdfs && selected && (
        <section className="step">
          <h2>
            <span className="num">4</span> Preview &amp; download
          </h2>
          <div className="results">
            <nav className="pdf-list" aria-label="Generated PDFs">
              {pdfs.map((p, i) => (
                <button key={p.name} className={i === current ? "active" : ""} onClick={() => setCurrent(i)}>
                  <span>{p.name}</span>
                  <span className="badge">{p.count}</span>
                </button>
              ))}
            </nav>
            <div className="preview">
              <div className="preview-actions">
                <strong>{selected.name}.pdf</strong>
                <div className="button-group">
                  <button onClick={() => downloadOne(selected)}>Download PDF</button>
                  {pdfs.length > 1 && (
                    <button className="primary" onClick={() => void downloadAll()}>
                      Download all (.zip)
                    </button>
                  )}
                </div>
              </div>
              <ErrorBoundary resetKey={selected}>
                <Suspense fallback={<div className="viewer viewer-loading muted">Loading viewer…</div>}>
                  <PdfViewer data={selected.bytes} />
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        </section>
      )}

      <footer className="muted">
        Your data never leaves this page. <a href="https://github.com/OCIoficial/credentials">Source</a>
      </footer>
    </div>
  );
}
