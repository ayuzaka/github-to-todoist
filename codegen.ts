import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  overwrite: true,
  schema: "node_modules/@octokit/graphql-schema/schema.graphql",
  documents: ["src/github.graphql"],
  generates: {
    "src/github.generated.ts": {
      plugins: ["typescript", "typescript-operations"],
      config: {
        useTypeImports: true,
      },
    },
  },
};

export default config;
