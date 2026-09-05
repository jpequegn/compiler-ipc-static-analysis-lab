# Verification evidence

The complete suite contains 36 tests. It exercises runtime schemas, real compiler
facts, AST source spans, prompt fixtures, project boundaries, subprocess transport,
timeouts and restart, preview approval, stale plans, injected write failure with
rollback, CLI exit codes, benchmark equivalence and a golden demo report.

`npm run check` passes on Node 22.22.3 with TypeScript 5.9.3. GitHub CI runs the same
command on Ubuntu with Node 22 for each task PR.

## Local benchmark example

Command: `node dist/packages/cli/src/main.js benchmark --project fixtures/demo --iterations 7 --json`

The [raw result](benchmark-example.json) records this machine's environment and all
samples. On Apple M4 / macOS arm64, in-process median was 77.98 ms and IPC median
was 79.59 ms. Startup and project open took 195.45 ms. Every measured result matched
the same expected diagnostic set and source fingerprint.

The 1.61 ms observed median difference is not a pure IPC cost. Both modes reload
the project and construct the compiler program, with independent process heaps,
scheduling and measurement noise. This is one local example, not a regression
threshold or a TypeScript 7 comparison.

## Deliberate failure behavior

- The checked-in demo scan exits 1 because its type error and policy findings are intentional.
- Unsupported prompts, malformed messages, stale approval and invalid project input fail explicitly.
- Import replacements preserve other text; semantic API compatibility still requires review.
- Invalid UTF-8, malformed syntax, expanded files beyond limits and mutated approval plans cannot be applied.

## Review corrections

The final review added method-specific response validation, rejected fixes that
would exceed loader limits, required valid syntax before edits, and checked the
whole rebuilt plan before direct-library apply. Regression tests cover each case.
