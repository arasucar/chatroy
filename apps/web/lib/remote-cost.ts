type Price = {
  inputPerMillion: number;
  outputPerMillion: number;
};

const OPENAI_PRICES: Record<string, Price> = {
  "gpt-5-mini": { inputPerMillion: 0.25, outputPerMillion: 2.0 },
};

export function estimateOpenAICostUsd(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number | null {
  const price = OPENAI_PRICES[input.model];
  if (!price) return null;

  const inputCost = (input.inputTokens / 1_000_000) * price.inputPerMillion;
  const outputCost = (input.outputTokens / 1_000_000) * price.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}
