import { beforeEach, describe, expect, it, vi } from "vitest";
import { splitDocumentIntoChunks } from "../lib/retrieval";
import { cleanDb, testDb } from "./setup";

const unitVector = (value: number) =>
  Array.from({ length: 768 }, (_, index) => (index === 0 ? value : 0));

vi.mock("../lib/provider", () => ({
  generateEmbeddings: vi.fn(),
}));

describe("splitDocumentIntoChunks — paragraph-aware", () => {
  it("preserves paragraph boundaries when total fits within target", () => {
    const para1 = Array.from({ length: 80 }, (_, i) => `alpha${i}`).join(" ");
    const para2 = Array.from({ length: 80 }, (_, i) => `beta${i}`).join(" ");
    const text = `${para1}\n\n${para2}`;
    const chunks = splitDocumentIntoChunks(text);
    // Both paragraphs together (160 words) fit within 220-word target
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain("alpha0");
    expect(chunks[0]).toContain("beta0");
  });

  it("splits across paragraphs when total exceeds budget", () => {
    const makePara = (seed: string) =>
      Array.from({ length: 150 }, (_, i) => `${seed}${i}`).join(" ");
    const text = [makePara("a"), makePara("b"), makePara("c")].join("\n\n");
    const chunks = splitDocumentIntoChunks(text);
    // 450 words with target 220 must produce more than one chunk
    expect(chunks.length).toBeGreaterThan(1);
    // First chunk must not balloon well beyond target (allow some overlap headroom)
    const firstChunkWords = chunks[0].split(/\s+/).filter(Boolean).length;
    expect(firstChunkWords).toBeLessThanOrEqual(220 + 40 + 5);
  });

  it("handles oversized single paragraphs by splitting at sentence boundaries", () => {
    // Build a single paragraph (no blank lines) of ~500 words using short sentences
    const sentences = Array.from(
      { length: 50 },
      (_, i) => `This is sentence number ${i} and it has exactly ten words total.`,
    );
    const text = sentences.join(" ");
    const chunks = splitDocumentIntoChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const words = chunk.split(/\s+/).filter(Boolean).length;
      // No chunk should massively exceed the target (allow overlap headroom)
      expect(words).toBeLessThanOrEqual(220 + 40 + 20);
    }
  });

  it("carries overlap words from the previous chunk into the next chunk", () => {
    // Three 150-word paragraphs; flush happens after the first paragraph pair
    const makePara = (seed: string) =>
      Array.from({ length: 150 }, (_, i) => `${seed}${i}`).join(" ");
    const text = [makePara("x"), makePara("y"), makePara("z")].join("\n\n");
    const chunks = splitDocumentIntoChunks(text, 220, 40);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // At least one word from the tail of chunk[0] should appear in chunk[1]
    const lastWordsOfChunk0 = chunks[0].split(/\s+/).slice(-40);
    const chunk1Words = new Set(chunks[1].split(/\s+/));
    const overlap = lastWordsOfChunk0.filter((w) => chunk1Words.has(w));
    expect(overlap.length).toBeGreaterThan(0);
  });

  it("returns [] for empty and whitespace-only input", () => {
    expect(splitDocumentIntoChunks("")).toEqual([]);
    expect(splitDocumentIntoChunks("   ")).toEqual([]);
    expect(splitDocumentIntoChunks("\n\n\n")).toEqual([]);
  });
});

describe("retrieval helpers", () => {
  beforeEach(async () => {
    await cleanDb();
    vi.resetModules();
  });

  it("splits documents into multiple retrieval chunks", async () => {
    const { splitDocumentIntoChunks } = await import("../lib/retrieval");
    const text = Array.from({ length: 520 }, (_, index) => `word${index}`).join(" ");
    const chunks = splitDocumentIntoChunks(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBeGreaterThan(0);
  });

  it("indexes documents and retrieves cited chunks", async () => {
    const { generateEmbeddings } = await import("../lib/provider");
    vi.mocked(generateEmbeddings)
      .mockImplementationOnce(async ({ texts }: { texts: string[] }) =>
        texts.map((_, index) => unitVector(index === 0 ? 0.9 : 0.2)),
      )
      .mockResolvedValueOnce([unitVector(1)]);

    const { createDocumentWithEmbeddings, listDocuments, searchDocs } = await import(
      "../lib/retrieval"
    );

    const [user] = await testDb
      .insert((await import("../lib/db/schema")).schema.users)
      .values({ email: "retrieval@test.local", role: "admin" })
      .returning();

    const rawText = [
      Array.from({ length: 240 }, () => "database").join(" "),
      Array.from({ length: 240 }, () => "network").join(" "),
    ].join("\n\n");

    const document = await createDocumentWithEmbeddings({
      title: "Ops Notes",
      rawText,
      uploadedByUserId: user.id,
    });

    expect(document.chunkCount).toBeGreaterThan(1);

    const listed = await listDocuments();
    expect(listed[0].title).toBe("Ops Notes");
    expect(listed[0].chunkCount).toBe(document.chunkCount);

    const citations = await searchDocs("database question");
    expect(citations.length).toBeGreaterThan(0);
    expect(citations[0].documentTitle).toBe("Ops Notes");
  });
});
