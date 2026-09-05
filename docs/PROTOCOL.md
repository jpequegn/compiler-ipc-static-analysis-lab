# Protocol version 1

The service exchanges one UTF-8 JSON object per newline over stdin/stdout.
Start it with `node dist/packages/service/src/server.js --root /absolute/root`.
Stdout contains protocol messages only. This process listens on no network port.

Every request has `version: 1`, a nonempty string `id`, a `method`, and `params`.
Unknown fields, methods and versions are rejected. Success responses have
`{version:1,id,ok:true,result:...}`. Errors have
`{version:1,id,ok:false,error:{code,message}}`. A frame that cannot be correlated
uses `id: null`. The client validates the result schema for the requested method.

| Method | Parameters | Result |
| --- | --- | --- |
| openProject | `path`, relative to the configured root | `projectId`, `files`, `fingerprint` |
| listFiles | `projectId` | `files`, `fingerprint` |
| proposeRule | `prompt` | `generator`, normalized `prompt`, typed `rule`, `explanation` |
| getDiagnostics | `projectId`, `rules` array, default empty | `compilerFacts`, `ruleFindings`, `fingerprint` |
| applyRule, preview mode | `projectId`, `rule`, `mode:"preview"` | `approvalId`, `fingerprint`, `rule`, `changes`, `status` |
| applyRule, apply mode | `projectId`, `rule`, `mode:"apply"`, `approvalId` | `status`, approval ID, changed files, before/after fingerprints |

Example opening request:

```json
{"version":1,"id":"open-1","method":"openProject","params":{"path":"fixtures/demo"}}
```

Use the returned project ID in subsequent requests. IDs and pending previews live
only in the process session. Reopen after restart. Diagnostics remain deterministic
for identical sources and rules. A request reads current sources; openProject does
not freeze the files.

## Rule language

```json
{"kind":"forbidden-import","module":"legacy-api"}
{"kind":"forbidden-import","module":"legacy-api","replacement":"modern-api"}
{"kind":"forbidden-call","callee":"eval"}
{"kind":"require-try-catch","callee":"fetch"}
```

Import matching covers static imports, re-exports, import-equals, dynamic import
and syntactically named require calls with a literal argument. Require shadowing
is not resolved. Call matching supports dotted names and literal element access;
aliases and indirect calls are outside the rule's definition. The catch rule
requires a directly awaited named call within a try block that has a catch in the
same function. Calls inside catch or finally are not protected by that same try.

Findings have `source`, `code`, `message`, project-relative `file`, `start`, `length`,
`line`, and `column`. Offsets and lengths use JavaScript UTF-16 code units; lines
and columns are one-based. Fileless compiler facts use zero for line and column.

## Approval behavior

Only explicit import replacement supports edits. A preview includes each file's
before/after text and unified diff. SHA-256 binds the protocol version, canonical
root, all TypeScript contents, normalized rule, and exact changes.

Apply requires a matching stored preview for the same session/project/rule. It
rebuilds the plan, checks the whole project's fingerprint, and compares the exact
plan before staging files. A successful apply consumes the pending preview.
The CLI creates a fresh session for each command and regenerates the preview
before checking the approval ID supplied by the user. The hash is review evidence,
not a secret or an authentication credential.

The service stages new contents and original backups in sibling temporary files,
then atomically renames each source. Caught errors trigger rollback. If rollback
fails, `RECOVERY_REQUIRED` instructs the operator to inspect retained
`.compiler-lab-*.backup` files. Sudden termination can leave partial changes or
temporary files. Use version control for recovery and avoid concurrent writers.

## Limits and errors

| Limit | Value |
| --- | ---: |
| Request frame | 64 KiB |
| Response frame | 4 MiB |
| Open sessions | 16 |
| Pending previews | 32, oldest evicted |
| Client pending calls | 32 |
| TypeScript files | 100 |
| Source size per file | 256 KiB |
| Total TypeScript source | 2 MiB |
| Directory entries examined | 1000 |
| Rules per request | 20 |

Errors include `INVALID_REQUEST`, `INVALID_JSON`, `FRAME_ERROR`, `PATH_DENIED`,
`PROJECT_LIMIT`, `INVALID_SOURCE`, `INVALID_SYNTAX`, `UNSUPPORTED_PROMPT`,
`UNKNOWN_PROJECT`, `APPROVAL_REQUIRED`, `STALE_PREVIEW`, `NO_FIX`, `NO_CHANGES`,
and `RESPONSE_LIMIT`. A client timeout or malformed response stops its child
process and rejects all pending requests. Create a new client to resume; the client
never retries a write automatically.
