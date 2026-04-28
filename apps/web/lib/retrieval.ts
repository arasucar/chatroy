import { count, desc, eq, sql } from "drizzle-orm";
import { requireDb } from "./db";
import {
  documentChunks,
  documents,
  type MessageCitation,
} from "./db/schema";
import { excerpt } from "./utils";
import { generateEmbeddings } from "./provider";

export type DocumentRow = typeof documents.$inferSelect;
export type DocumentChunkRow = typeof documentChunks.$inferSelect;

export type DocumentSummary = {
  id: string;
  title: string;
  sourceName: string | null;
  updatedAt: Date;
  chunkCount: number;
};

type SearchResultRow = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  score: number;
};

function vectorLiteral(value: number[]): string {
  return `[${value.join(",")}]`;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function deriveTitle(title: string | null, sourceName: string | null, text: string): string {
  const explicit = title?.trim();
  if (explicit) return explicit;

  const source = sourceName?.trim();
  if (source) return source;

  const firstLine = normalizeText(text).split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "Untitled document";
  if (firstLine.length <= 72) return firstLine;
  return `${firstLine.slice(0, 69).trimEnd()}...`;
}

export const EMBEDDING_DIMENSIONS = 768;

export function splitDocumentIntoChunks(
  text: string,
  targetWords = 220,
  overlapWords = 40,
): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  // Split into paragraphs on blank lines
  const paragraphs = normalized.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let buffer: string[] = []; // accumulated paragraph strings
  let bufferWordCount = 0;

  function flush() {
    if (buffer.length === 0) return;
    chunks.push(buffer.join("\n\n").trim());
    buffer = [];
    bufferWordCount = 0;
  }

  function wordCount(s: string): number {
    return s.split(/\s+/).filter(Boolean).length;
  }

  for (const para of paragraphs) {
    const paraWords = wordCount(para);

    if (paraWords > targetWords) {
      // Oversized paragraph: flush buffer first, then split at sentence boundaries.
      // Falls back to word-based splitting when no sentence boundaries exist or a
      // single sentence is itself larger than the target.
      flush();
      const sentences = para.split(/(?<=[.!?])\s+/);
      let sentenceBuffer: string[] = [];
      let sentenceWordCount = 0;

      for (const sentence of sentences) {
        const sw = wordCount(sentence);

        if (sw > targetWords) {
          // Single over-budget sentence: emit accumulated buffer then word-split this sentence
          if (sentenceBuffer.length > 0) {
            chunks.push(sentenceBuffer.join(" ").trim());
            sentenceBuffer = [];
            sentenceWordCount = 0;
          }
          const words = sentence.split(/\s+/).filter(Boolean);
          let wi = 0;
          while (wi < words.length) {
            const slice = words.slice(wi, wi + targetWords).join(" ").trim();
            if (slice) chunks.push(slice);
            if (wi + targetWords >= words.length) break;
            wi += Math.max(1, targetWords - overlapWords);
          }
          continue;
        }

        if (sentenceWordCount + sw > targetWords && sentenceBuffer.length > 0) {
          chunks.push(sentenceBuffer.join(" ").trim());
          // Overlap: carry last `overlapWords` words into next chunk
          const all = sentenceBuffer.join(" ").split(/\s+/);
          const overlap = all.slice(-overlapWords).join(" ");
          sentenceBuffer = overlap ? [overlap] : [];
          sentenceWordCount = wordCount(overlap);
        }
        sentenceBuffer.push(sentence);
        sentenceWordCount += sw;
      }
      if (sentenceBuffer.length > 0) {
        chunks.push(sentenceBuffer.join(" ").trim());
      }
      continue;
    }

    if (bufferWordCount + paraWords > targetWords && buffer.length > 0) {
      // Flush current buffer, apply overlap from last chunk
      flush();
      // Overlap: carry last `overlapWords` words of the just-flushed chunk
      const lastChunk = chunks[chunks.length - 1] ?? "";
      const overlapText = lastChunk.split(/\s+/).slice(-overlapWords).join(" ");
      if (overlapText) {
        buffer = [overlapText];
        bufferWordCount = wordCount(overlapText);
      }
    }

    buffer.push(para);
    bufferWordCount += paraWords;
  }

  flush();
  return chunks;
}

export async function createDocumentWithEmbeddings(input: {
  title?: string | null;
  sourceName?: string | null;
  mimeType?: string | null;
  rawText: string;
  uploadedByUserId: string;
}): Promise<DocumentSummary> {
  const db = requireDb();
  const rawText = normalizeText(input.rawText);
  if (!rawText) {
    throw new Error("Document text cannot be empty.");
  }

  const chunks = splitDocumentIntoChunks(rawText);
  if (chunks.length === 0) {
    throw new Error("Document did not produce any retrievable chunks.");
  }

  const embeddings = await generateEmbeddings({ texts: chunks });
  if (embeddings.length !== chunks.length) {
    throw new Error("Embedding generation returned an unexpected number of vectors.");
  }

  const now = new Date();
  return db.transaction(async (tx) => {
    const [document] = await tx
      .insert(documents)
      .values({
        title: deriveTitle(input.title ?? null, input.sourceName ?? null, rawText),
        sourceName: input.sourceName ?? null,
        mimeType: input.mimeType ?? null,
        rawText,
        uploadedByUserId: input.uploadedByUserId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await tx.insert(documentChunks).values(
      chunks.map((chunk, chunkIndex) => ({
        documentId: document.id,
        chunkIndex,
        content: chunk,
        embedding: embeddings[chunkIndex],
        createdAt: now,
      })),
    );

    return {
      id: document.id,
      title: document.title,
      sourceName: document.sourceName,
      updatedAt: document.updatedAt,
      chunkCount: chunks.length,
    };
  });
}

export async function listDocuments(limit = 50): Promise<DocumentSummary[]> {
  const db = requireDb();
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      sourceName: documents.sourceName,
      updatedAt: documents.updatedAt,
      chunkCount: count(documentChunks.id),
    })
    .from(documents)
    .leftJoin(documentChunks, eq(documentChunks.documentId, documents.id))
    .groupBy(documents.id)
    .orderBy(desc(documents.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sourceName: row.sourceName,
    updatedAt: row.updatedAt,
    chunkCount: Number(row.chunkCount),
  }));
}

export async function searchDocs(query: string, limit = 4): Promise<MessageCitation[]> {
  const db = requireDb();
  const normalized = normalizeText(query);
  if (!normalized) return [];

  const [queryEmbedding] = await generateEmbeddings({ texts: [normalized] });
  if (!queryEmbedding) return [];

  const rows = (await db.execute(sql`
    with q as (select ${vectorLiteral(queryEmbedding)}::vector as vec)
    select
      dc.id as "chunkId",
      dc.document_id as "documentId",
      d.title as "documentTitle",
      dc.chunk_index as "chunkIndex",
      dc.content as "content",
      1 - (dc.embedding <=> q.vec) as "score"
    from document_chunks dc
    cross join q
    inner join documents d on d.id = dc.document_id
    where 1 - (dc.embedding <=> q.vec) > 0.1
    order by dc.embedding <=> q.vec
    limit ${limit}
  `)) as SearchResultRow[];

  return rows.map((row) => ({
    documentId: row.documentId,
    documentTitle: row.documentTitle,
    chunkId: row.chunkId,
    chunkIndex: row.chunkIndex,
    excerpt: excerpt(row.content),
    score: Number(row.score),
  }));
}

export function buildRetrievalSystemPrompt(citations: MessageCitation[]): string {
  const numberedSources = citations
    .map((citation, index) => {
      return `[${index + 1}] ${citation.documentTitle}\n${citation.excerpt}`;
    })
    .join("\n\n");

  return [
    "You have access to retrieved internal documents.",
    "Use the retrieved excerpts when they are relevant.",
    "If you rely on them, cite them inline using [1], [2], etc.",
    "If the documents are insufficient, say so plainly instead of inventing details.",
    "",
    numberedSources,
  ].join("\n");
}
