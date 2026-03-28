import type { OpenAIMessage } from "./openai.ts";

const OPENAI_STREAM_ENDPOINT = "https://api.openai.com/v1/chat/completions";

interface StreamOpenAIChatOptions {
  apiKey: string;
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  maxCompletionTokens?: number;
}

export async function streamOpenAIChatCompletion(options: StreamOpenAIChatOptions) {
  const {
    apiKey,
    model,
    messages,
    temperature = 0.8,
    maxCompletionTokens = 1200,
  } = options;

  const response = await fetch(OPENAI_STREAM_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_completion_tokens: maxCompletionTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI stream error ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error("OpenAI did not return a stream body");
  }

  return response;
}
