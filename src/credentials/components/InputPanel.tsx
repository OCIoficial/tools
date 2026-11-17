import { useRef, useState } from "react";

interface Props {
  onText: (text: string, source: string) => void;
  compact: boolean;
}

export function InputPanel({ onText, compact }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [paste, setPaste] = useState("");

  const readFile = async (file: File) => onText(await file.text(), file.name);

  const loadSample = async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}sample.csv`);
    onText(await res.text(), "sample.csv");
  };

  return (
    <div className={`input-panel ${compact ? "compact" : ""}`}>
      <div
        className={`dropzone ${dragOver ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void readFile(file);
        }}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = "";
          }}
        />
        <strong>{compact ? "Load another CSV" : "Drop a CSV file here"}</strong>
        <span className="muted">or click to browse. You can also paste anywhere on the page.</span>
      </div>
      {!compact && (
        <div className="paste-box">
          <textarea
            placeholder="…or paste rows here (e.g. copied from Google Sheets)"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={4}
          />
          <div className="row">
            <button className="primary" disabled={!paste.trim()} onClick={() => onText(paste, "pasted text")}>
              Load pasted data
            </button>
            <button className="link" onClick={() => void loadSample()}>
              Try with sample data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
