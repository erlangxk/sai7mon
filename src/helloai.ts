import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import { AiError, LanguageModel, Prompt, Response } from "effect/unstable/ai"

const ollamaUrl = "http://localhost:11434/api/generate"
const model = "gemma4"

interface OllamaGenerateResponse {
  readonly response: string
  readonly prompt_eval_count?: number
  readonly eval_count?: number
}

const flattenPrompt = (prompt: Prompt.Prompt): string =>
  prompt.content
    .map((message) => {
      if (message.role === "system") {
        return `system: ${message.content}`
      }

      const text = message.content
        .map((part) => {
          switch (part.type) {
            case "text":
            case "reasoning":
              return part.text
            default:
              return ""
          }
        })
        .filter((value) => value.length > 0)
        .join("\n")

      return `${message.role}: ${text}`
    })
    .filter((value) => value.length > 0)
    .join("\n\n")

const usage = (inputTokens?: number, outputTokens?: number) => ({
  inputTokens: {
    uncached: inputTokens,
    total: inputTokens,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: outputTokens,
    text: outputTokens,
    reasoning: undefined,
  },
})

const aiFailure = (method: string, description: string) =>
  AiError.make({
    module: "Ollama",
    method,
    reason: new AiError.UnknownError({
      description,
    }),
  })

const callOllama = (prompt: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(ollamaUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama request failed with status ${response.status}`)
      }

      const data = (await response.json()) as Partial<OllamaGenerateResponse>

      if (typeof data.response !== "string") {
        throw new Error("Ollama response did not include generated text")
      }

      return data as OllamaGenerateResponse
    },
    catch: (error) =>
      aiFailure(
        "generateText",
        error instanceof Error ? error.message : "Unknown Ollama error",
      ),
  })

const generateText = (options: LanguageModel.ProviderOptions) =>
  Effect.gen(function* () {
    const result = yield* callOllama(flattenPrompt(options.prompt))

    return [
      {
        type: "text" as const,
        text: result.response,
      },
      {
        type: "finish" as const,
        reason: "stop" as const,
        usage: usage(result.prompt_eval_count, result.eval_count),
      },
    ]
  })

const streamText = (options: LanguageModel.ProviderOptions) =>
  Stream.unwrap(
    Effect.map(generateText(options), (parts) => {
      const textPart = parts[0]
      const finishPart = parts[1]

      if (textPart?.type !== "text" || finishPart?.type !== "finish") {
        return Stream.fail(
          aiFailure("streamText", "Unexpected response shape while streaming Ollama output"),
        )
      }

      return Stream.fromIterable([
        {
          type: "text-start" as const,
          id: "0",
        },
        {
          type: "text-delta" as const,
          id: "0",
          delta: textPart.text,
        },
        {
          type: "text-end" as const,
          id: "0",
        },
        finishPart,
      ])
    }),
  )

const ollamaModel = LanguageModel.make({
  generateText,
  streamText,
})

const program = Effect.gen(function* () {
  yield* Effect.log("Calling local ollama...")
  const response = yield* LanguageModel.generateText({
    prompt: "What is Effect-TS? Reply in one short paragraph.",
  })
  yield* Effect.log(response.text)
})

Effect.runPromise(
  Effect.provideServiceEffect(program, LanguageModel.LanguageModel, ollamaModel),
)
