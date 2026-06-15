import { Effect, Schema } from "effect";
import { LanguageModel, Tool, Toolkit } from "effect/unstable/ai";

const askAi = Effect.fn("askAi")(function* (prompt: string) {
  const model = yield* LanguageModel.LanguageModel;
  const response = yield* model.generateText({ prompt });

  yield* Effect.logInfo(
    `finishReason=${response.finishReason} outputTokens=${response.usage.outputTokens.total}`,
  );

  return response.text;
});

export const program = Effect.gen(function* () {
  const text = yield* askAi("What is Effect-TS? Reply in one short paragraph.");
  yield* Effect.log(text);
});


const ReleaseSummary = Schema.Struct({
  title: Schema.String,
  highlights: Schema.Array(Schema.String),
  riskLevel: Schema.Literals(["low", "medium", "high"]),
});

export const extractReleaseSummary = Effect.fn("extractReleaseSummary")(
  function* (notes: string) {
    const model = yield* LanguageModel.LanguageModel;
    const response = yield* model.generateObject({
      objectName: "release_summary",
      prompt: "Extract a summary from these notes:\n" + notes,
      schema: ReleaseSummary,
    });

    return response.value;
  },
);


const GetWeather = Tool.make("GetWeather", {
  description: "Get weather for a city",
  parameters: Schema.Struct({
    city: Schema.String,
  }),
  success: Schema.Struct({
    city: Schema.String,
    forecast: Schema.String,
  }),
});

const WeatherToolkit = Toolkit.make(GetWeather);

const WeatherToolkitLayer = WeatherToolkit.toLayer(
  Effect.succeed(
    WeatherToolkit.of({
      GetWeather: ({ city }) =>
        Effect.succeed({
          city,
          forecast: "Sunny, 24C ，非常好的天气！",
        }),
    }),
  ),
);

export const askWithTools = Effect.fn("askWithTools")(
  function* (question: string) {
    const toolkit = yield* WeatherToolkit;
    const response = yield* LanguageModel.generateText({
      prompt: question,
      toolkit,
      toolChoice: "auto",
    });

    return {
      text: response.text,
      toolCalls: response.toolCalls,
      toolResults: response.toolResults,
    };
  },
  Effect.provide(WeatherToolkitLayer)
);

export const programWithTools = Effect.gen(function* () {
  const answer = yield* askWithTools(
    "What is the weather forecast for New York City tomorrow?",
  );
  yield* Effect.log("Answer: " + answer.text);
  yield* Effect.log("Tool calls: " + JSON.stringify(answer.toolCalls));
  yield* Effect.log("Tool results: " + JSON.stringify(answer.toolResults));
});