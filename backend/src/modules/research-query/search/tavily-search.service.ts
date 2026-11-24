import { tavily } from "@tavily/core";
import dotenv from "dotenv";

dotenv.config();

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

/**
 * Service to perform live web searches using Tavily Search API.
 * Provides clean excerpts, titles, and URLs for grounding LLM synthesis.
 * Skips live search when no API key is configured and surfaces request failures
 * so the current research step can be persisted as failed and retried.
 */
export class TavilySearchService {
  private client: ReturnType<typeof tavily> | null = null;
  private apiKey: string | undefined;

  constructor() {
    this.initClient();
  }

  private initClient() {
    this.apiKey = process.env.TAVILY_API_KEY?.trim();
    if (this.apiKey) {
      try {
        this.client = tavily({ apiKey: this.apiKey });
      } catch (err) {
        console.warn("[TavilySearchService] Could not initialize Tavily client:", err);
        this.client = null;
      }
    }
  }

  private getClient(): ReturnType<typeof tavily> | null {
    const currentKey = process.env.TAVILY_API_KEY?.trim();
    if (currentKey && currentKey !== this.apiKey) {
      this.initClient();
    }
    return this.client;
  }

  /**
   * Search the web for a targeted query.
   * Returns empty array if key is missing or search fails.
   */
  public async search(
    query: string,
    maxResults: number = 3,
  ): Promise<WebSearchResult[]> {
    const cleanQuery = query?.trim();
    if (!cleanQuery) return [];

    const client = this.getClient();
    if (!client || !this.apiKey) {
      console.warn(
        `[TavilySearchService] TAVILY_API_KEY not configured. Skipping live web search for: "${cleanQuery}". Set TAVILY_API_KEY in backend/.env to enable live web search.`,
      );
      return [];
    }

    try {
      console.log(
        `[TavilySearchService] Querying Tavily: "${cleanQuery}" (maxResults: ${maxResults})...`,
      );
      const response = await client.search(cleanQuery, {
        maxResults,
        searchDepth: "basic",
        includeAnswer: false,
      });

      if (!response || !Array.isArray(response.results)) {
        return [];
      }

      const results: WebSearchResult[] = response.results.map((r: any) => ({
        title: r.title || "Untitled Web Source",
        url: r.url || "",
        content: r.content || "",
        score: typeof r.score === "number" ? r.score : undefined,
      }));

      console.log(
        `[TavilySearchService] Retrieved ${results.length} results for: "${cleanQuery}"`,
      );
      return results;
    } catch (error: unknown) {
      console.error(
        `[TavilySearchService] Search error for query "${cleanQuery}":`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
}

export const tavilySearchService = new TavilySearchService();
