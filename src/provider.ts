/**
 * AI SDK provider — single source of truth for model access.
 *
 * grant-pilot uses Anthropic models (Sonnet 4.6 primary, Haiku 4.5
 * fallback) through Vercel's AI SDK provider abstraction. The SDK
 * wraps Anthropic's API in a provider-agnostic interface so the same
 * agent code could route to OpenAI / Google / etc. tomorrow with a
 * one-line provider swap.
 *
 * The fallback ladder consumes this to build model instances per
 * rung. Sub-agents never instantiate models directly — they go
 * through the ladder, which goes through this provider.
 */

import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * The Anthropic provider instance.
 *
 * Reads ANTHROPIC_API_KEY from env. The provider is a factory:
 * `anthropic("claude-sonnet-4-6")` returns a LanguageModelV1 the AI
 * SDK can drive with `generateText`, `streamText`, `generateObject`,
 * etc.
 *
 * Single instance per process — cheap to share since it's just a
 * config object, not a connection pool.
 */
export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
