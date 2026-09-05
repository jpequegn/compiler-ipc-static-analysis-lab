# Implementation plan

Source: https://github.com/jpequegn/project-ideas/issues/255

Build a local compiler-service experiment using Node 22, TypeScript, npm workspaces,
Zod validation, the Node test runner, and the TypeScript compiler API. This is our
own versioned NDJSON protocol, not an implementation of an upstream TypeScript 7 API.

## Scope and decisions

- Workspaces: core domain/analysis, service transport/client, CLI workflows.
- Read only marked synthetic projects under an explicit local root. Fixed compiler
  options avoid loading project plugins or executing project code.
- Rules: forbidden imports, forbidden calls, awaited calls requiring try/catch.
  These are explicit syntactic policies, not complete program safety proofs.
- Curated prompt fixtures are deterministic. Live LLM integration is a future
  extension; no provider credentials or network calls are needed.
- Only import-module replacement has a code fix. Preview shows a unified diff;
  applying requires a matching content-bound approval ID. Other rules report findings.
- Compiler facts, requested rule intent, and approval evidence are separate fields.
- Benchmark the same analysis in-process and over a warm child-process connection.
  Report startup separately and make no universal performance claims.

## Ordered tasks

1. Scaffold TypeScript workspaces and CI.
2. Define versioned protocol and rule schemas.
3. Implement bounded project loading and AST diagnostics.
4. Map curated natural-language requests to typed rules.
5. Build local NDJSON service and resilient client.
6. Require preview and explicit approval for import edits.
7. Expose CLI reports and reproducible IPC benchmarks.
8. Complete integration coverage and usage guide.

Each task gets its own branch, tests, PR, passing CI, and merge. Completion requires
all eight task issues closed, verification on main, and a source-issue closeout.
