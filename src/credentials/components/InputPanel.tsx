import { Button, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconUpload } from "@tabler/icons-react";
import { useRef, useState } from "react";
import classes from "./InputPanel.module.css";

interface Props {
  onText: (text: string, source: string) => void;
  compact: boolean;
}

export function InputPanel({ onText, compact }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const readFile = async (file: File) => onText(await file.text(), file.name);

  const loadSample = async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}credentials/sample.csv`);
    onText(await res.text(), "sample.csv");
  };

  return (
    <Stack gap="xs" align="stretch">
      <UnstyledButton
        className={classes.dropzone}
        data-over={dragOver || undefined}
        data-compact={compact || undefined}
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
        <Group gap="xs" justify="center" wrap="nowrap">
          <IconUpload size={18} />
          <Text fw={600}>{compact ? "Load another CSV" : "Drop a CSV file here"}</Text>
        </Group>
        <Text size="sm" c="dimmed">
          or click to browse. To paste rows (e.g. copied from Google Sheets), press Ctrl+V anywhere on the page.
        </Text>
      </UnstyledButton>
      {!compact && (
        <Group>
          <Button variant="subtle" onClick={() => void loadSample()}>
            Try with sample data
          </Button>
        </Group>
      )}
    </Stack>
  );
}
