# Usage, learning, and extensions

## What this project demonstrates

The complete path is a natural-language request, a validated policy object, a local
IPC request, TypeScript analysis, and a report with source locations. Import
migrations extend that path with a reviewable diff and explicit approval.

You can inspect every intermediate object. The five prompt fixtures make the
experiment repeatable and usable offline after installation. They demonstrate the
contract that an eventual model adapter would need to satisfy; they do not
demonstrate unrestricted language understanding.

## A first session

1. Run `npm ci` and `npm run check`.
2. Run `npm run lab -- prompts` to see accepted requests.
3. Scan with `npm run lab -- scan --prompt "forbid eval calls"`. Compare the type
   error with the policy violation. Both have source spans, but their origins differ.
4. Scan with `npm run lab -- scan --prompt "require try catch around awaited fetch calls"`.
   The unprotected fetch is flagged; the one inside a try/catch is accepted.
5. Make the disposable fixture copy described in the README. Preview the import
   replacement, inspect its diff, and apply using the displayed approval ID.
6. Preview another disposable copy, change a source, and attempt to use the old
   approval. It should fail with a stale-preview error.
7. Run `npm run lab -- benchmark --iterations 7`. Compare distributions, not a single
   sample. Run it while the computer is otherwise idle for clearer evidence.

The example source is never executed. Its fetch and eval calls are analysis input.

## Typical uses

Use the lab to test repository policy ideas before turning them into permanent
lint rules. A small fixture can make a team's intention precise: which import
forms count, whether aliases matter, and where an awaited operation needs handling.

Use preview/apply to study migration review. The supported fix changes only import
module literals; it preserves other text and requires approval tied to exact
contents. The synthetic declarations deliberately make both module names valid.
Real packages still require API compatibility checks and project tests.

Use the transport tests as examples for developer tools that run out of process.
Try breaking a response schema or terminating the service, then observe how the
client rejects pending calls and requires a new session.

Use JSON output as an evaluation dataset. Pair a request and typed intent with
expected diagnostics, then measure false positives and missed findings separately
from whether a generated rule passed schema validation.

## Learning path

| Exercise | Read first | Evidence to produce |
| --- | --- | --- |
| Trace an import diagnostic through its AST node | `packages/core/src/analyze.ts` and the TypeScript compiler API guide | A source span that selects exactly the module literal |
| Add one curated prompt | `prompts.ts` and `tests/prompts.test.ts` | Accepted prompt, validated rule, unsupported-prompt regression |
| Add a new syntactic rule | `protocol.ts`, `analyze.ts` | Positive and negative fixtures, including comments and nested functions |
| Break and restore the IPC contract | `docs/PROTOCOL.md`, `tests/ipc.test.ts` | An invalid-version rejection and equivalent results after restart |
| Study stale approvals | `edits.ts`, `tests/edits.test.ts` | A rejected stale plan with unchanged source contents |
| Interpret benchmark noise | `benchmark.ts` | Several saved JSON reports with metadata and an explanation of variance |

Primary references:

- [TypeScript compiler API guide](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), programs, source files, traversal and diagnostics.
- [Node child processes](https://nodejs.org/api/child_process.html), process lifecycle and stdio.
- [Node streams](https://nodejs.org/api/stream.html), framing, buffering and backpressure.
- [Zod documentation](https://zod.dev/), runtime contracts for external data.

The pinned TypeScript API is the established JavaScript API. Validate any native
TypeScript service API independently before building an adapter to it.

## Extensions worth trying

**Policy generation evaluation.** Add an optional model adapter that proposes only
the rule JSON schema. Run its output against hidden positive/negative fixtures and
compare it with the deterministic catalogue. Record invalid rules, unsupported
intent and diagnostic precision separately. Keep approval outside the generator.

**Review rules from incidents.** Turn a recurring code-review comment or a small
postmortem into a policy proposal and synthetic regression fixture. This makes the
lesson executable and lets reviewers reject rules that flag legitimate patterns.

**Agent migration checkpoint.** Let a coding agent request previews, then present
the diff and approval ID in a review UI. A human can approve the exact migration;
the agent receives an error if it subsequently changes the project before applying.

**Protocol adapter comparison.** Implement a second analyzer behind the same
contracts and compare its diagnostics with the current compiler host. Golden
fixtures expose compatibility differences before a toolchain upgrade.

**Semantic rule experiments.** Add TypeScript symbol resolution for aliases and
shadowed names. Keep separate tests and metrics for syntactic versus semantic rules,
so a more complex implementation must show what additional cases it handles.

## Practical limits

This version has a CLI and a local stdio service. It does not include an editor
extension, browser dashboard, remote service, or live model adapter. The project
marker is a scope convention, not a security boundary against hostile local code.
The process is not OS-sandboxed. Filesystem checks cover normal local use and tested
symlink/traversal cases; they do not defend against an adversary racing filesystem
changes. Multi-file apply is not crash-transactional. Run it on disposable synthetic
projects, use one writer, and keep source control available for recovery.

Benchmarks rebuild the compiler program in both modes. They measure this workload
and include scheduling, compiler work, serialization and separate process heaps.
They do not establish a universal IPC cost or a performance comparison with
TypeScript 7.
