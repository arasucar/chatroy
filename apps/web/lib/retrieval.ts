import { count, desc, eq, sql } from "drizzle-orm";
import { requireDb } from "./db";
import {
  documentChunks,
  documents,
  type MessageCitation,
} from "./db/schema";
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

export function splitDocumentIntoChunks(
  text: string,
  targetWords = 220,
  overlapWords = 40,
): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let index = 0;

  while (index < words.length) {
    const slice = words.slice(index, index + targetWords).join(" ").trim();
    if (slice) chunks.push(slice);
    if (index + targetWords >= words.length) break;
    index += Math.max(1, targetWords - overlapWords);
  }

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
    select
      dc.id as "chunkId",
      dc.document_id as "documentId",
      d.title as "documentTitle",
      dc.chunk_index as "chunkIndex",
      dc.content as "content",
      1 - (dc.embedding <=> ${vectorLiteral(queryEmbedding)}::vector) as "score"
    from document_chunks dc
    inner join documents d on d.id = dc.document_id
    order by dc.embedding <=> ${vectorLiteral(queryEmbedding)}::vector
    limit ${limit}
  `)) as SearchResultRow[];

  return rows
    .map((row) => ({
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      chunkId: row.chunkId,
      chunkIndex: row.chunkIndex,
      excerpt: row.content.length <= 240 ? row.content : `${row.content.slice(0, 237).trimEnd()}...`,
      score: Number(row.score),
    }))
    .filter((row) => Number.isFinite(row.score) && row.score > 0);
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
