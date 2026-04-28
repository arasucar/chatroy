import { logger } from "./logger";

type Price = {
  inputPerMillion: number;
  outputPerMillion: number;
};

const OPENAI_PRICES: Record<string, Price> = {
  // GPT-5 family
  "gpt-5":           { inputPerMillion: 10.0,  outputPerMillion: 40.0  },
  "gpt-5-mini":      { inputPerMillion: 0.25,  outputPerMillion: 2.0   },
  // GPT-4.1 family
  "gpt-4.1":         { inputPerMillion: 2.0,   outputPerMillion: 8.0   },
  "gpt-4.1-mini":    { inputPerMillion: 0.40,  outputPerMillion: 1.60  },
  "gpt-4.1-nano":    { inputPerMillion: 0.10,  outputPerMillion: 0.40  },
  // GPT-4o family
  "gpt-4o":          { inputPerMillion: 2.50,  outputPerMillion: 10.0  },
  "gpt-4o-mini":     { inputPerMillion: 0.15,  outputPerMillion: 0.60  },
  // GPT-4 legacy
  "gpt-4-turbo":     { inputPerMillion: 10.0,  outputPerMillion: 30.0  },
  "gpt-4":           { inputPerMillion: 30.0,  outputPerMillion: 60.0  },
  // GPT-3.5
  "gpt-3.5-turbo":   { inputPerMillion: 0.50,  outputPerMillion: 1.50  },
};

export function estimateOpenAICostUsd(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number | null {
  const price = OPENAI_PRICES[input.model];
  if (!price) {
    logger.warn("remote-cost.unknown-model", { model: input.model });
    return null;
  }

  const inputCost = (input.inputTokens / 1_000_000) * price.inputPerMillion;
  const outputCost = (input.outputTokens / 1_000_000) * price.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}
