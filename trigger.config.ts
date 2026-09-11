import { defineConfig } from "@trigger.dev/sdk";
import { puppeteer } from "@trigger.dev/build/extensions/puppeteer";

export default defineConfig({
  project: "proj_evrklkwbpghqlkodmyvs",
  dirs: ["./src/trigger"],
  maxDuration: 300, // seconds; orchestrator overrides this higher since it waits on every stage
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 5_000,
      maxTimeoutInMs: 30_000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    extensions: [puppeteer()],
  },
});
