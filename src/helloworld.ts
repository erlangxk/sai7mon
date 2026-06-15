import { Effect } from "effect";
import { program } from "./helloai.js";
const helloWorld = Effect.log("Hello, World! 🎉");

Effect.runSync(helloWorld);

Effect.runPromise(program).then(() => {
  console.log("Program finished");
}).catch((error) => {
  console.error("Program failed with error:", error);
});

