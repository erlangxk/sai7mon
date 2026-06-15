import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat"
import { Effect, Layer } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"

const ollamaApiUrl = "http://localhost:11434/v1"
const ollamaModel = "gemma4"

const OllamaClientLayer = OpenAiClient.layer({
  apiUrl: ollamaApiUrl,
}).pipe(Layer.provide(FetchHttpClient.layer))

const askOllama = Effect.fn("askOllama")(
  function*(prompt: string) {
    const model = yield* LanguageModel.LanguageModel
    const response = yield* model.generateText({ prompt })

    yield* Effect.logInfo(
      `finishReason=${response.finishReason} outputTokens=${response.usage.outputTokens.total}`,
    )

    return response.text
  },
  Effect.provide(OpenAiLanguageModel.model(ollamaModel)),
  Effect.provide(OllamaClientLayer),
)

export const program = Effect.gen(function*() {
  const text = yield* askOllama("What is Effect-TS? Reply in one short paragraph.")
  yield* Effect.log(text)
})

