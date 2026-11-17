import {
  Accordion,
  Alert,
  Anchor,
  AppShell,
  Badge,
  Button,
  Checkbox,
  Container,
  Grid,
  Group,
  Loader,
  NavLink,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconDownload, IconFileZip } from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { AppHeader } from "../shared/AppHeader.tsx";
import classes from "./App.module.css";
import { ColumnMapper } from "./components/ColumnMapper";
import { DriveUploadButton, DriveUploadStatus } from "./components/DriveUpload";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { InputPanel } from "./components/InputPanel";
import { columnNames, dataRows, groupBySite, pdfFileNames, safeFileName, titleCase, toUsers } from "./lib/data";
import { FIELDS, requiredFields } from "./lib/fields";
import {
  generate,
  isUploading,
  loadPdfLib,
  loadText,
  PHASES,
  phaseOf,
  setCurrent,
  setError,
  setGroupSites,
  setHasHeader,
  setMapping,
  setPhaseName,
  setYear,
  useStore,
  type GeneratedPdf,
} from "./store";

// pdf.js is loaded on demand, only once there is something to preview.
const PdfViewer = lazy(() => import("./components/PdfViewer").then((m) => ({ default: m.PdfViewer })));

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

const downloadOne = (pdf: GeneratedPdf) =>
  downloadBlob(new Blob([pdf.bytes as BlobPart], { type: "application/pdf" }), `${safeFileName(pdf.name)}.pdf`);

async function downloadAll(pdfs: GeneratedPdf[], phase: string) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const names = pdfFileNames(pdfs.map((pdf) => pdf.name));
  pdfs.forEach((pdf, i) => zip.file(names[i], pdf.bytes));
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `credentials ${safeFileName(phase)}.zip`);
}

/** A numbered step of the page. */
function Step({ num, title, children }: { num: number; title: string; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="lg" component="section">
      <Group gap="sm" mb="md" wrap="nowrap">
        <ThemeIcon radius="xl" size={28}>
          <Text size="sm" fw={700} span>
            {num}
          </Text>
        </ThemeIcon>
        <Title order={2} size="h4">
          {title}
        </Title>
      </Group>
      {children}
    </Paper>
  );
}

export default function Credentials() {
  const rows = useStore((s) => s.rows);
  const source = useStore((s) => s.source);
  const hasHeader = useStore((s) => s.hasHeader);
  const mapping = useStore((s) => s.mapping);
  const groupSites = useStore((s) => s.groupSites);
  const phaseName = useStore((s) => s.phaseName);
  const year = useStore((s) => s.year);
  const error = useStore((s) => s.error);
  const generating = useStore((s) => s.generating);
  const pdfs = useStore((s) => s.pdfs);
  const current = useStore((s) => s.current);
  const uploading = useStore(isUploading);

  const phase = phaseOf({ phaseName, year });

  // Warm up the font/logo download while the user maps columns.
  useEffect(() => {
    if (rows) void loadPdfLib().then((m) => m.loadAssets()).catch(() => {});
  }, [rows]);

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

  const canGenerate = rows !== null && missing.length === 0 && users.length > 0;
  const selected = pdfs?.[current];

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <AppHeader />
      </AppShell.Header>
      <AppShell.Main>
        <Container size="lg" px={0}>
          <Stack gap="md">
            <Text c="dimmed">
              Generate printable OCI login credentials from a CSV. Everything runs in your browser.
            </Text>

            {error && (
              <Alert color="red" title="Something went wrong" withCloseButton onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {uploading && (
              <Alert color="yellow" title="Uploading to Google Drive">
                The data and options are locked until the upload finishes, so the PDFs uploaded are the ones
                shown below.
              </Alert>
            )}

            {/* A disabled fieldset locks the fields and buttons of steps 1–3; the store guarantees it anyway. */}
            <fieldset disabled={uploading} className={classes.fieldset}>
              <Stack gap="md">
                <Step num={1} title="Load data">
                  {rows && (
                    <Text size="sm" c="dimmed" mb="sm">
                      Loaded {body.length} {body.length === 1 ? "row" : "rows"} and {columns.length} columns from{" "}
                      {source}.
                    </Text>
                  )}
                  <InputPanel onText={loadText} compact={rows !== null} />
                </Step>

                {rows && (
                  <Step num={2} title="Match columns">
                    <Checkbox
                      label="First row is a header"
                      checked={hasHeader}
                      onChange={(e) => setHasHeader(e.currentTarget.checked)}
                    />
                    <ColumnMapper
                      columns={columns}
                      samples={samples}
                      mapping={mapping}
                      required={required}
                      onChange={setMapping}
                    />

                    {missing.length === 0 && users.length > 0 && (
                      <Accordion variant="contained" mt="md">
                        <Accordion.Item value="data">
                          <Accordion.Control>
                            Check data ({users.length} {users.length === 1 ? "credential" : "credentials"})
                          </Accordion.Control>
                          <Accordion.Panel>
                            <ScrollArea.Autosize mah={320}>
                              <Table stickyHeader striped fz="sm" className={classes.table}>
                                <Table.Thead>
                                  <Table.Tr>
                                    <Table.Th>Name</Table.Th>
                                    <Table.Th>Username</Table.Th>
                                    <Table.Th>Password</Table.Th>
                                    {groupSites && <Table.Th>Site</Table.Th>}
                                  </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                  {users.map((u, i) => (
                                    <Table.Tr key={i}>
                                      <Table.Td>{titleCase(`${u.firstName} ${u.lastName}`.trim())}</Table.Td>
                                      <Table.Td ff="monospace">{u.username}</Table.Td>
                                      <Table.Td ff="monospace">{u.password}</Table.Td>
                                      {groupSites && <Table.Td>{u.site}</Table.Td>}
                                    </Table.Tr>
                                  ))}
                                </Table.Tbody>
                              </Table>
                            </ScrollArea.Autosize>
                          </Accordion.Panel>
                        </Accordion.Item>
                      </Accordion>
                    )}
                  </Step>
                )}

                {rows && (
                  <Step num={3} title="Options">
                    <Group align="flex-end" gap="md">
                      <Select
                        label="Phase"
                        data={PHASES}
                        value={phaseName}
                        onChange={(value) => value && setPhaseName(value)}
                        allowDeselect={false}
                        w={140}
                      />
                      <TextInput
                        label="Year"
                        value={year}
                        onChange={(e) => setYear(e.currentTarget.value)}
                        inputMode="numeric"
                        w={90}
                      />
                      <Checkbox
                        label="One PDF per site"
                        checked={groupSites}
                        onChange={(e) => setGroupSites(e.currentTarget.checked)}
                        mb={8}
                      />
                      {/* Mantine keeps the button's width while it shows the loader. */}
                      <Button disabled={!canGenerate} loading={generating} onClick={() => void generate(groups)}>
                        {groupSites ? `Generate ${groups.size} PDFs` : "Generate PDF"}
                      </Button>
                      <span className={classes.visuallyHidden} role="status">
                        {generating ? "Generating PDFs…" : pdfs ? "PDFs ready" : ""}
                      </span>
                    </Group>
                    {missing.length > 0 && (
                      <Text size="sm" c="dimmed" mt="sm">
                        Assign a column to: {missing.map((f) => f.label).join(", ")}.
                      </Text>
                    )}
                  </Step>
                )}

              </Stack>
            </fieldset>

            {pdfs && selected && (
              <Step num={4} title="Preview, download & upload">
                <Grid gap="md">
                  <Grid.Col span={{ base: 12, sm: 3 }}>
                    {/* On a phone a dropdown takes less room than the list. */}
                    <Select
                      hiddenFrom="sm"
                      aria-label="PDF to preview"
                      data={pdfs.map((p, i) => ({ value: String(i), label: `${p.name} (${p.count})` }))}
                      value={String(current)}
                      onChange={(value) => value && setCurrent(Number(value))}
                      allowDeselect={false}
                    />
                    <ScrollArea.Autosize mah="75vh" visibleFrom="sm">
                      <nav aria-label="Generated PDFs">
                        {pdfs.map((p, i) => (
                          <NavLink
                            key={p.name}
                            label={p.name}
                            active={i === current}
                            onClick={() => setCurrent(i)}
                            rightSection={
                              <Badge size="sm" variant="light" color="gray">
                                {p.count}
                              </Badge>
                            }
                          />
                        ))}
                      </nav>
                    </ScrollArea.Autosize>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 9 }}>
                    <Stack gap="sm">
                      <Group justify="space-between" gap="sm">
                        <Text fw={700} className={classes.pdfName}>
                          {selected.name}.pdf
                        </Text>
                        <div className={classes.downloads}>
                          <Button
                            variant="default"
                            leftSection={<IconDownload size={16} />}
                            onClick={() => downloadOne(selected)}
                          >
                            Download PDF
                          </Button>
                          {pdfs.length > 1 && (
                            <Button
                              leftSection={<IconFileZip size={16} />}
                              onClick={() => void downloadAll(pdfs, phase)}
                            >
                              Download all (.zip)
                            </Button>
                          )}
                          <DriveUploadButton pdfs={pdfs} />
                        </div>
                      </Group>
                      <DriveUploadStatus />
                      <ErrorBoundary resetKey={selected}>
                        <Suspense
                          fallback={
                            <Paper withBorder className={classes.viewerLoading}>
                              <Loader size="sm" />
                            </Paper>
                          }
                        >
                          <PdfViewer data={selected.bytes} />
                        </Suspense>
                      </ErrorBoundary>
                    </Stack>
                  </Grid.Col>
                </Grid>
              </Step>
            )}

            <Text size="sm" c="dimmed" ta="center">
              Your data never leaves this page, unless you upload the PDFs to Google Drive.{" "}
              <Anchor href="https://github.com/OCIoficial/tools/tree/main/src/credentials" size="sm">
                Source
              </Anchor>
            </Text>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
