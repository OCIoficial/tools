import { Alert, Anchor, Button, Progress, Stack, Text } from "@mantine/core";
import { IconBrandGoogleDrive } from "@tabler/icons-react";
import { AuthError, folderUrl, useDrive } from "../google/index.ts";
import { clearUpload, setError, uploadAll, useStore, type GeneratedPdf } from "../store";

/** Button that uploads every PDF to a Drive folder, one file per PDF. */
export function DriveUploadButton({ pdfs }: { pdfs: GeneratedPdf[] }) {
  const drive = useDrive();
  const upload = useStore((s) => s.upload);
  const uploading = upload?.status === "uploading";

  if (!drive.available) return null;

  if (!drive.signedIn) {
    return (
      <Button
        variant="default"
        leftSection={<IconBrandGoogleDrive size={16} />}
        loading={drive.connecting}
        onClick={() => void drive.signIn()}
      >
        Sign in to upload to Drive
      </Button>
    );
  }

  const start = async () => {
    try {
      const folder = await drive.pickFolder();
      if (folder) await uploadAll(folder, (name, bytes) => drive.upload(folder, name, bytes));
    } catch (e) {
      setError(e instanceof AuthError ? e.message : `Could not open Google Drive: ${(e as Error).message}`);
    }
  };

  return (
    <Button
      variant="default"
      leftSection={<IconBrandGoogleDrive size={16} />}
      loading={uploading}
      onClick={() => void start()}
    >
      {pdfs.length === 1 ? "Upload to Drive" : "Upload all to Drive"}
    </Button>
  );
}

/** Progress and result of the upload. */
export function DriveUploadStatus() {
  const upload = useStore((s) => s.upload);
  if (!upload) return null;

  const folder = (
    <Anchor href={folderUrl(upload.folder)} target="_blank" rel="noreferrer" inherit>
      {upload.folder.name}
    </Anchor>
  );
  const files = (n: number) => `${n} ${n === 1 ? "PDF" : "PDFs"}`;

  if (upload.status === "uploading") {
    return (
      <Stack gap={4} role="status">
        <Text size="sm">
          Uploading to {folder}… {upload.done} of {upload.total}
        </Text>
        <Progress value={(upload.done / upload.total) * 100} animated />
      </Stack>
    );
  }
  if (upload.status === "done") {
    return (
      <Alert color="green" withCloseButton onClose={clearUpload} role="status">
        Uploaded {files(upload.total)} to {folder}.
      </Alert>
    );
  }
  return (
    <Alert color="red" title="Upload failed" withCloseButton onClose={clearUpload}>
      {upload.error}{" "}
      {upload.done > 0 && (
        <>
          {files(upload.done)} of {upload.total} were uploaded to {folder} before the error; uploading again creates
          them again.
        </>
      )}
    </Alert>
  );
}
