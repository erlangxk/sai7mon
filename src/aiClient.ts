import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat";
import { Layer } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";

const ollamaApiUrl = "http://localhost:11434/v1";
const ollamaModel = "gemma4";

const OllamaClientLayer = OpenAiClient.layer({
  apiUrl: ollamaApiUrl,
}).pipe(Layer.provide(FetchHttpClient.layer));

export const useOllama = (
  model: string = ollamaModel,
): Layer.Layer<LanguageModel.LanguageModel> =>
  OpenAiLanguageModel.model(model).pipe(Layer.provide(OllamaClientLayer));
