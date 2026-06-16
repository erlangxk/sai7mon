import { Effect, Schema } from "effect";
import { LanguageModel, Tool, Toolkit, AiError } from "effect/unstable/ai";

// ============================================================================
// Tools Definition
// ============================================================================

const Calculator = Tool.make("Calculator", {
  description: "Perform arithmetic calculations",
  parameters: Schema.Struct({
    expression: Schema.String,
  }),
  success: Schema.Struct({
    result: Schema.Number,
  }),
});

const Weather = Tool.make("Weather", {
  description: "Get weather information for a city",
  parameters: Schema.Struct({
    city: Schema.String,
  }),
  success: Schema.Struct({
    city: Schema.String,
    temperature: Schema.Number,
    condition: Schema.String,
  }),
});

// Combine tools into a toolkit
const AgentToolkit = Toolkit.make(Calculator, Weather);

// Create tool handlers (mock implementations)
const AgentToolkitLayer = AgentToolkit.toLayer(
  Effect.succeed(
    AgentToolkit.of({
      Calculator: ({ expression }) => {
        // Mock calculator
        try {
          // Simple eval for demo (NOT secure - use proper math parser in production)
          const result = Function('"use strict"; return (' + expression + ")")();
          return Effect.succeed({ result });
        } catch (error) {
          return Effect.fail(new AiError.InvalidOutputError({ description: `Invalid expression: ${expression}` }));
        }
      },
      Weather: ({ city }) => {
        // Mock weather data
        const weatherData: Record<string, { temp: number; condition: string }> = {
          NYC: { temp: 22, condition: "Partly Cloudy" },
          "San Francisco": { temp: 18, condition: "Foggy" },
          Tokyo: { temp: 28, condition: "Sunny" },
        };
        const data = weatherData[city];
        if (data) {
          return Effect.succeed({
            city,
            temperature: data.temp,
            condition: data.condition,
          });
        }
        return Effect.fail(new AiError.InvalidUserInputError({ description: `City not found: ${city}` }));
      },
    }),
  ),
);

// ============================================================================
// Agent Decision Schema
// ============================================================================

const AgentDecision = Schema.Struct({
  reasoning: Schema.String,
  action: Schema.Literals(["use_calculator", "use_weather", "final_answer"]),
  toolInput: Schema.optional(
    Schema.Struct({
      expression: Schema.optional(Schema.String),
      city: Schema.optional(Schema.String),
    }),
  ),
  answer: Schema.optional(Schema.String),
});

type AgentDecision = Schema.Schema.Type<typeof AgentDecision>;

// ============================================================================
// Agent Loop Implementation
// ============================================================================

export const agentLoop = Effect.fn("agentLoop")(
  function* (userQuestion: string, maxIterations: number = 5) {
    const model = yield* LanguageModel.LanguageModel;
    let iteration = 0;
    let conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

    yield* Effect.logInfo(`Starting agent loop for: ${userQuestion}`);

    while (iteration < maxIterations) {
      iteration++;
      yield* Effect.logInfo(`--- Iteration ${iteration} ---`);

      // Build prompt with conversation history
      let prompt = userQuestion;
      if (conversationHistory.length > 0) {
        prompt = `Previous conversation:\n${conversationHistory
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join("\n")}\n\nContinue reasoning to answer the original question: ${userQuestion}`;
      }

      // Agent decides: use a tool or return final answer
      const decision = yield* model.generateObject({
        objectName: "agent_decision",
        prompt: `${prompt}\n\nDecide what to do next:
1. use_calculator - if you need to perform calculations
2. use_weather - if you need weather information
3. final_answer - if you have enough information to answer

Respond with your reasoning, the action to take, and necessary parameters.`,
        schema: AgentDecision,
      });

      const agentDecision = decision.value;
      conversationHistory.push({
        role: "assistant",
        content: `Reasoning: ${agentDecision.reasoning}, Action: ${agentDecision.action}`,
      });

      yield* Effect.logInfo(`Decision: ${agentDecision.action}`);
      yield* Effect.logInfo(`Reasoning: ${agentDecision.reasoning}`);

      // Execute based on decision
      if (agentDecision.action === "final_answer") {
        const finalAnswer = agentDecision.answer || "No answer provided";
        yield* Effect.logInfo(`Final Answer: ${finalAnswer}`);
        return finalAnswer;
      } else if (
        agentDecision.action === "use_calculator" &&
        agentDecision.toolInput?.expression
      ) {
        yield* Effect.logInfo(
          `Executing calculator: ${agentDecision.toolInput.expression}`,
        );
        try {
          const result = Function(
            '"use strict"; return (' + agentDecision.toolInput.expression + ")",
          )();
          const toolResult = `Calculator result: ${result}`;
          conversationHistory.push({
            role: "user",
            content: toolResult,
          });
          yield* Effect.logInfo(toolResult);
        } catch (error) {
          const errorMsg = `Calculator error: ${error instanceof Error ? error.message : String(error)}`;
          conversationHistory.push({
            role: "user",
            content: errorMsg,
          });
          yield* Effect.logInfo(errorMsg);
        }
      } else if (agentDecision.action === "use_weather" && agentDecision.toolInput?.city) {
        yield* Effect.logInfo(`Getting weather for: ${agentDecision.toolInput.city}`);
        try {
          const weatherData: Record<string, { temp: number; condition: string }> = {
            NYC: { temp: 22, condition: "Partly Cloudy" },
            "San Francisco": { temp: 18, condition: "Foggy" },
            Tokyo: { temp: 28, condition: "Sunny" },
            London: { temp: 15, condition: "Rainy" },
          };
          const data = weatherData[agentDecision.toolInput.city];
          if (data) {
            const toolResult = `Weather in ${agentDecision.toolInput.city}: ${data.temp}°C, ${data.condition}`;
            conversationHistory.push({
              role: "user",
              content: toolResult,
            });
            yield* Effect.logInfo(toolResult);
          } else {
            const errorMsg = `City not found: ${agentDecision.toolInput.city}`;
            conversationHistory.push({
              role: "user",
              content: errorMsg,
            });
            yield* Effect.logInfo(errorMsg);
          }
        } catch (error) {
          const errorMsg = `Weather error: ${error instanceof Error ? error.message : String(error)}`;
          conversationHistory.push({
            role: "user",
            content: errorMsg,
          });
          yield* Effect.logInfo(errorMsg);
        }
      }
    }

    return `Max iterations (${maxIterations}) reached. Could not complete the task.`;
  },
  Effect.provide(AgentToolkitLayer)
);

// ============================================================================
// Example Programs
// ============================================================================

export const simpleAgentProgram = Effect.gen(function* () {
  const answer = yield* agentLoop(
    "What is the temperature in Tokyo plus 5?",
    3,
  );
  yield* Effect.log(`\n✓ Final Result: ${answer}`);
});

export const complexAgentProgram = Effect.gen(function* () {
  const answer = yield* agentLoop(
    "Compare the temperature in NYC and San Francisco, then calculate the difference",
    5,
  );
  yield* Effect.log(`\n✓ Final Result: ${answer}`);
});

export const weatherAgentProgram = Effect.gen(function* () {
  const answer = yield* agentLoop(
    "What's the weather in London?",
    2,
  );
  yield* Effect.log(`\n✓ Final Result: ${answer}`);
});

// ============================================================================
// Simpler Alternative: Direct Tool Usage (without loop)
// ============================================================================

export const directToolUsage = Effect.gen(function* () {
  yield* Effect.logInfo("--- Direct Tool Usage Example ---");

  const response = yield* LanguageModel.generateText({
    prompt:
      "What is the weather in NYC right now? Also, what is 15 + 27?",
    toolkit: AgentToolkit,
    toolChoice: "auto",
  });

  yield* Effect.log(`Answer: ${response.text}`);

  if (response.toolCalls.length > 0) {
    yield* Effect.log(`Tool calls made: ${JSON.stringify(response.toolCalls)}`);
  }

  if (response.toolResults.length > 0) {
    yield* Effect.log(`Tool results: ${JSON.stringify(response.toolResults)}`);
  }
});
