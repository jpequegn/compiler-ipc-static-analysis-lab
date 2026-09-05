# Compiler IPC static analysis lab

Turn a curated natural-language request into a typed TypeScript policy, run it in
a local compiler service, and inspect source-level diagnostics. Preview import
migrations and apply only the exact diff you approve.

Source idea: [project-ideas #255](https://github.com/jpequegn/project-ideas/issues/255).
See [the implementation plan](IMPLEMENTATION_PLAN.md),
[usage and learning guide](PROJECT_GUIDE.md), and [protocol reference](docs/PROTOCOL.md).

## Run it

Requires Node.js 22 or newer and npm. No API keys or running server required.

```sh
git clone https://github.com/jpequegn/compiler-ipc-static-analysis-lab.git
cd compiler-ipc-static-analysis-lab
npm ci
npm run check
npm run lab -- prompts
npm run lab -- scan --project fixtures/demo --prompt "forbid eval calls"
```

The demo intentionally contains a TypeScript error and policy violations. The scan
reports `TS2322` at `main.ts:3:14` and the `eval` call at `main.ts:7:3`. Exit code 1
means findings were detected. Exit code 2 means the operation failed.

```sh
npm run lab -- scan --project fixtures/demo --prompt "require try catch around awaited fetch calls" --json
npm run lab -- preview --project fixtures/demo --prompt "replace imports from legacy-api with modern-api"
npm run lab -- benchmark --project fixtures/demo --iterations 7
```

For machine-readable stdout without npm's script banner, use
`node dist/packages/cli/src/main.js ... --json` or `npm run --silent lab -- ... --json`.

## Try an approved edit

Work on a disposable copy so the original fixture remains available for tests.

```sh
mkdir -p .scratch
cp -R fixtures/demo .scratch/review
npm run lab -- preview --project .scratch/review --prompt "replace imports from legacy-api with modern-api"
```

Read the diff, then use its displayed approval ID:

```sh
npm run lab -- apply --project .scratch/review --prompt "replace imports from legacy-api with modern-api" --approve HASH_FROM_PREVIEW
npm run lab -- scan --project .scratch/review --prompt "forbid imports from legacy-api"
```

The forbidden import disappears. The deliberate type error remains. Changing any
TypeScript source after preview makes approval stale and requires a new review.

## What is implemented

| Capability | Behavior |
| --- | --- |
| Prompt catalogue | Five documented requests mapped to validated rules |
| Compiler diagnostics | Real TypeScript compiler facts with file, line, column and source span |
| Policy diagnostics | Forbidden imports, forbidden named calls, directly awaited calls requiring try/catch |
| Local IPC | Versioned NDJSON, project sessions, bounded frames, structured errors and timeouts |
| Approved edits | Literal import replacement, unified diff, content-bound approval and stale-plan rejection |
| Benchmark | Equivalent analysis in-process and over IPC, warmup, sample distributions and startup timing |

The project uses TypeScript 5.9.3's compiler API. Its IPC protocol is a learning
experiment owned by this repository. It does not claim compatibility with a
TypeScript 7 native service. The [upstream compiler API guide](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
describes the API family used here.

## Scope

Analysis accepts marked synthetic projects only. Each project needs
`compiler-lab.json` containing `{"synthetic":true}`. Source files must be valid
UTF-8. The loader reads `.ts` and `.tsx` files under `--root`, rejects symlinks and
traversal, and skips `node_modules`, `.git`, and `dist`.

Compiler options are fixed. The service does not load project plugins, execute
project code, or make network requests. The rules are syntactic policies: they do
not resolve aliases, prove runtime safety, or establish API compatibility. Prompt
mapping is deterministic; no live LLM adapter is included.

Import fixes require valid syntax. Writes use per-file atomic renames with rollback
on caught errors. This is a local single-writer lab, without OS sandboxing or a
crash-durable multi-file transaction. Avoid concurrent edits while applying. Review
and test a migration's semantics yourself.

## Development

```sh
npm run build
npm test
npm run check
```

`packages/core` contains project loading, schemas, analysis, prompt fixtures, and
approved edits. `packages/service` contains the dispatcher, framing, server and
client. `packages/cli` contains commands, reports and the benchmark. CI runs the
same verification on Node 22. All eight implementation tasks are tracked in this
repository's issues and linked PRs.
