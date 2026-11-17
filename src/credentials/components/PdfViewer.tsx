import { ActionIcon, Alert, Group, Paper, Text } from "@mantine/core";
import { IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
// The legacy build includes polyfills for very recent JS features
// (e.g. Map.prototype.getOrInsertComputed, Math.sumPrecise) that the modern
// build uses directly and that some browsers (e.g. Firefox for Android)
// don't support yet.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

import classes from "./PdfViewer.module.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  data: Uint8Array;
}

/** Renders every page of a PDF to canvases using pdf.js. */
export function PdfViewer({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shownDataRef = useRef<Uint8Array | null>(null);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || width === 0) return;
    let cancelled = false;
    // pdf.js takes ownership of the buffer, so give it a copy.
    const task = pdfjs.getDocument({ data: data.slice() });
    setError(null);

    (async () => {
      const pdf = await task.promise;
      if (cancelled) return;
      // Render every page off-screen first and swap them in at once, so the
      // viewer never collapses to an empty box (which makes the page jump).
      const dpr = window.devicePixelRatio || 1;
      const canvases: HTMLCanvasElement[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const cssWidth = Math.min(width - 16, 900) * zoom;
        const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${(cssWidth * base.height) / base.width}px`;
        canvas.setAttribute("aria-label", `Page ${n}`);
        await page.render({ canvas, viewport }).promise;
        if (cancelled) return;
        canvases.push(canvas);
      }
      // Keep the reading position when zooming; start at the top for a new PDF.
      const isNewDoc = shownDataRef.current !== data;
      const ratio = el.scrollHeight > 0 ? el.scrollTop / el.scrollHeight : 0;
      el.replaceChildren(...canvases);
      el.scrollTop = isNewDoc ? 0 : ratio * el.scrollHeight;
      shownDataRef.current = data;
      setPages(pdf.numPages);
    })().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [data, width, zoom]);

  return (
    <Paper withBorder className={classes.viewer}>
      <Group justify="space-between" className={classes.bar}>
        <Text size="sm" c="dimmed">
          {pages} {pages === 1 ? "page" : "pages"}
        </Text>
        <Group gap={4} wrap="nowrap">
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            aria-label="Zoom out"
          >
            <IconZoomOut size={18} />
          </ActionIcon>
          <Text size="sm" w={48} ta="center">
            {Math.round(zoom * 100)}%
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            aria-label="Zoom in"
          >
            <IconZoomIn size={18} />
          </ActionIcon>
        </Group>
      </Group>
      {error && (
        <Alert color="red" radius={0}>
          Could not render preview: {error}
        </Alert>
      )}
      <div className={classes.pages} ref={containerRef} />
    </Paper>
  );
}
