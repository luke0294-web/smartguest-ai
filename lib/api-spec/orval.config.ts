import { defineConfig, InputTransformerFn } from "orval";
import path from "path";

const root = path.resolve(__dirname, "..", "..");
const apiClientReactSrc = path.resolve(root, "lib", "api-client-react", "src");
const apiZodSrc = path.resolve(root, "lib", "api-zod", "src");

// Our exports make assumptions about the title of the API being "Api" (i.e. generated output is `api.ts`).
const titleTransformer: InputTransformerFn = (config) => {
  config.info ??= {};
  config.info.title = "Api";

  return config;
};

/**
 * ⚠️  `clean: true` regenerates lib/api-zod/src/generated/api.ts from scratch,
 * wiping a few HAND PATCHES that orval cannot produce. After every
 * `pnpm --filter @workspace/api-spec codegen`, restore them (see `git diff`):
 *  - `SendPropertyChatResponse`: an object { reply, propertyName } — orval
 *    emits `zod.unknown()` because the route streams text/event-stream (SSE).
 *  - `AiTranscribeBody.audio`, `AiVisionBody.image`,
 *    `AiExtractDocumentBody.document`: `zod.any()` — orval emits
 *    `zod.instanceof(File)`, which doesn't typecheck in this Node-side package.
 *  - Italian messages on `.max(...ContentMax, "Il manuale casa non può superare
 *    20.000 caratteri")` (create/update/hostUpdate) and on
 *    `setHostPasswordBodyHostPasswordMin` ("La password deve contenere almeno
 *    8 caratteri").
 *  - Italian messages on the `createDemoProspectBody` limits (PR #45):
 *    propertyName "Il nome della struttura non può superare 200 caratteri",
 *    manualContent "Le info sulla casa non possono superare 20.000 caratteri",
 *    suggestedQuestion "La domanda suggerita non può superare 500 caratteri".
 * Each patch also carries a comment in the generated file. Losing the SSE
 * patch or the messages does NOT break the build, so always review the diff.
 */
export default defineConfig({
  "api-client-react": {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiClientReactSrc,
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: path.resolve(apiClientReactSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
  zod: {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiZodSrc,
      client: "zod",
      target: "generated",
      mode: "split",
      clean: true,
      prettier: true,
      override: {
        zod: {
          // Workspace pins zod to v3 (catalog) — without this, orval's "auto"
          // detection can emit v4-only syntax (zod.int(), zod.uuid()) that
          // doesn't exist on the v3 top-level export.
          version: 3,
          coerce: {
            query: ['boolean', 'number', 'string'],
            param: ['boolean', 'number', 'string'],
          },
        },
        useDates: true,
      },
    },
  },
});
