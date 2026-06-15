import { Effect } from "effect";

const helloWorld = Effect.log("Hello, World! 🎉");

Effect.runSync(helloWorld);
