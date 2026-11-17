import { beforeEach, describe, expect, it } from "vitest";
import { setYear, uploadAll, useStore } from "./store";

const folder = { id: "f1", name: "Credentials" };
const pdf = (name: string) => ({ name, count: 1, bytes: new Uint8Array([1]) });

describe("uploadAll", () => {
  beforeEach(() => useStore.setState({ pdfs: [pdf("Santiago"), pdf("Online"), pdf("Santiago")], upload: null }));

  it("uploads each PDF as its own file, with unique names", async () => {
    const names: string[] = [];
    await uploadAll(folder, async (name) => {
      names.push(name);
    });
    expect(names).toEqual(["Santiago.pdf", "Online.pdf", "Santiago (2).pdf"]);
    expect(useStore.getState().upload).toEqual({ status: "done", folder, total: 3 });
  });

  it("stops at the first error and reports how many were uploaded", async () => {
    await uploadAll(folder, async (name) => {
      if (name === "Online.pdf") throw new Error("quota");
    });
    expect(useStore.getState().upload).toEqual({ status: "failed", folder, done: 1, total: 3, error: "quota" });
  });

  it("locks the inputs while uploading", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => (release = resolve));
    const upload = uploadAll(folder, () => first);
    setYear("1999");
    expect(useStore.getState().pdfs).toHaveLength(3);
    release();
    await upload;
    setYear("1999");
    expect(useStore.getState().pdfs).toBeNull();
  });
});
