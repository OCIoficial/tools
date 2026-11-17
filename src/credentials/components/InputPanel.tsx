import { Button, Group, SimpleGrid, Stack, Text, Textarea, UnstyledButton } from "@mantine/core";
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
  const [paste, setPaste] = useState("");

  const readFile = async (file: File) => onText(await file.text(), file.name);

  const loadSample = async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}credentials/sample.csv`);
    onText(await res.text(), "sample.csv");
  };

  return (
    <SimpleGrid cols={{ base: 1, sm: compact ? 1 : 2 }} spacing="md">
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
          or click to browse. You can also paste anywhere on the page.
        </Text>
      </UnstyledButton>
      {!compact && (
        <Stack gap="xs">
          <Textarea
            placeholder="…or paste rows here (e.g. copied from Google Sheets)"
            value={paste}
            onChange={(e) => setPaste(e.currentTarget.value)}
            autosize
            minRows={4}
            maxRows={10}
            classNames={{ input: classes.paste }}
          />
          <Group gap="xs">
            <Button disabled={!paste.trim()} onClick={() => onText(paste, "pasted text")}>
              Load pasted data
            </Button>
            <Button variant="subtle" onClick={() => void loadSample()}>
              Try with sample data
            </Button>
          </Group>
        </Stack>
      )}
    </SimpleGrid>
  );
}
