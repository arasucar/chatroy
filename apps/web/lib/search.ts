import type { MessageCitation } from "./db/schema";
import { logger } from "./logger";
import { excerpt } from "./utils";

const TAVILY_URL = "https://api.tavily.com/search";

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
};

type TavilyResponse = {
  results?: TavilyResult[];
};

export async function webSearch(
  query: string,
  limit = 4,
  apiKey = process.env.TAVILY_API_KEY,
): Promise<MessageCitation[]> {
  if (!apiKey) return [];

  try {
    const response = await fetch(TAVILY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query,
        topic: "general",
        search_depth: "basic",
        max_results: limit,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as TavilyResponse;
    const results = payload.results ?? [];

    return results
      .filter((result): result is Required<Pick<TavilyResult, "title" | "url" | "content">> & TavilyResult => {
        return Boolean(result.title && result.url && result.content);
      })
      .slice(0, limit)
      .map((result, index) => ({
        source: "search" as const,
        url: result.url,
        documentId: result.url,
        documentTitle: result.title,
        chunkId: result.url,
        chunkIndex: index,
        excerpt: excerpt(result.content),
        score: typeof result.score === "number" ? result.score : 0,
      }));
  } catch (error) {
    logger.error("tavily search failed", { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}
