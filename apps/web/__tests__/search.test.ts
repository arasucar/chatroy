import { afterEach, describe, expect, it, vi } from "vitest";
import { webSearch } from "../lib/search";

describe("webSearch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps Tavily results into search citations", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "TypeScript 5.8",
              url: "https://example.com/ts58",
              content: "TypeScript 5.8 improves narrowing and project references.",
              score: 0.92,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const results = await webSearch("TypeScript 5.8 release", 4, "tvly-test");

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("search");
    expect(results[0].url).toBe("https://example.com/ts58");
    expect(results[0].documentTitle).toBe("TypeScript 5.8");
  });

  it("returns [] on empty results", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );

    const results = await webSearch("query with no results", 4, "tvly-test");
    expect(results).toEqual([]);
  });

  it("returns [] on non-2xx", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("unauthorized", { status: 401 }),
    );

    const results = await webSearch("any query", 4, "tvly-test");
    expect(results).toEqual([]);
  });

  it("returns [] on network error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    const results = await webSearch("any query", 4, "tvly-test");
    expect(results).toEqual([]);
  });
});
