import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["src/index.ts"],
  project: ["src/**/*.ts"],
  includeEntryExports: true,
  ignore: ["src/github.generated.ts"],
};

export default config;
