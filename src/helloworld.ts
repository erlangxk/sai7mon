import { Effect, Layer } from "effect";
import { extractReleaseSummary, program, programWithTools } from "./helloai.js";
import { useOllama } from "./aiClient.js";
import { RunnerNotRegistered } from "effect/unstable/cluster/ClusterError";
const helloWorld = Effect.log("Hello, World! 🎉");

Effect.runSync(helloWorld);

const ollama = useOllama();

Effect.runPromise(Effect.provide(program,ollama)).then(() => {
  console.log("Program finished");
}).catch((error) => {
  console.error("Program failed with error:", error);
});


const notes = `
On June 9, 2026, Anthropic released Claude Fable 5, the first publicly available model in its Mythos class, and within three days a United States government export directive temporarily forced it back offline. It shipped as Anthropic's most capable widely released model, built for long-horizon agentic work, available the same day across the Claude API, AWS, Microsoft Foundry, and others.

Fable 5 is the public, guardrailed sibling of Mythos, the model Anthropic disclosed on April 7, 2026, and declined to release. The two are not separate architectures. Anthropic states that Claude Fable 5 and Claude Mythos 5 share the same underlying model and the same published specifications. Both carry a 1 million token context window by default and up to 128,000 output tokens per request, priced at $10 per million input tokens and $50 per million output tokens, double Claude Opus 4.8 on both sides. Anthropic says an external bug bounty of more than 1,000 hours produced no universal jailbreaks, while noting the UK AI Security Institute had made progress toward one in early testing.

    After two days of experience with Claude Fable 5 I think the best way to describe it is relentlessly proactive. It knows a whole lot of tricks and it will deploy pretty much any of them to get to its goal. - Simon Willison

The Messages API also behaves differently on these two models. Adaptive thinking is always on and is the only thinking mode. The raw chain of thought is never returned, with a thinking.display setting choosing between a readable summary and an empty field, and depth and spend are controlled through the effort parameter. Beyond thinking, the models support task budgets behind a beta header, the memory tool, code execution, programmatic tool calling, context editing, compaction, and vision.

Where Fable 5 is meant to earn its premium is sustained autonomy. Run inside an agent harness such as Claude Code or Claude Managed Agents, it is positioned to work for extended stretches, planning across stages, delegating to sub-agents, and verifying its own output. The AWS description lists long-running asynchronous execution, advanced vision over diagrams, charts, and tables in PDFs, and proactive self-verification.

Boris Cherny, who built Claude Code, wrote that it was "the first model I have used that was so methodical and precise, taking measurements and adding logs then verifying that it truly fixed the issue before declaring victory."

Others read the moment as a shift in the economics of software itself.

    I feel a lot of things changing as working software increasingly comes out on a tap. The Jevon's paradox kicks in and I feel my own demand for software growing substantially. - Andrej Karpathy

The operational catch is data retention, and it is not optional. Both Fable 5 and Mythos 5 are designated Covered Models that carry a mandatory 30-day retention window and are not available under zero data retention. Anthropic states the retained prompts and outputs are not used for training and are deleted after 30 days, except where held for a safety investigation or a legal obligation.

Anthropic frames the window as the cost of running its safety classifiers, which it says need cross-request visibility to catch patterns a real-time check misses, including best-of-N jailbreaking and larger campaigns such as state-sponsored espionage and data extortion. The requirement quickly created friction. Microsoft removed Fable 5 from its internal Copilot model picker, reported on June 10, because the retention term conflicts with the company's own zero-retention standard, even as it kept the model available to customers, and reporting on the decision noted that content flagged for review could be held considerably longer.

The capability that made all of this contentious sits upstream in Project Glasswing. By late May, Anthropic reported that partners had identified more than 10,000 high or critical severity vulnerabilities across systemically important codebases in a month, and that scanning more than 1,000 open-source projects with Mythos had surfaced 23,019 issues, of which 6,202 were high or critical severity.

Reporting indicates the directive followed after Amazon's security team flagged a jailbreak in Fable 5 to the White House. The administration, for its part, signaled the block might be temporary. White House AI adviser David Sacks wrote that "the Admin's hope now is that Anthropic remediates the safety issue, the export control is lifted, and Fable goes back into general release," adding that "the Admin wants all of this to happen as soon as possible."

Developers interested in learning more can consult Anthropic's model documentation for Fable 5 and Mythos 5 and its refusals and fallback guide, the AWS launch post and the Microsoft Foundry announcement, the Project Glasswing update, and Anthropic's statement on the government directive.`


Effect.runPromise(Effect.provide(extractReleaseSummary(notes),ollama)).then((summary) => {
  console.log("extractReleaseSummary finished");
  console.log("Summary:", JSON.stringify(summary, null, 2));
}).catch((error) => {
  console.error("extractReleaseSummary failed with error:", error);
});



Effect.runPromise(Effect.provide(programWithTools,ollama)).then(() => {
  console.log("programWithTools finished");
}).catch((error) => {
  console.error("programWithTools failed with error:", error);
});