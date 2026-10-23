# API Bird

## Planning (api-bird MCP)
Source of truth: `project: "api-bird"`, `service: "api-bird"`. No plan docs in the repo. Fallback REST: `https://planner.tinkeshwar.in/api/{plans,audits,issues}`.
- **Plan:** design, may have open questions; create as `draft`, no `NNN-` prefix in the title. Never implement directly; once approved, split into ≥1 issue per phase (plan slug in each issue, issue IDs listed in the plan).
- **Audit:** review report for one service.
- **Issue:** `bug|feature|enhancement|task`, zero open questions, one problem each.
- Numbers ("issue 4", "plan 001") → `get_*_by_number` first, else match the slug prefix.
- Open question or unresolved decision → stop and ask via `AskUserQuestion`; write the answer into the doc.
- Update status in the same turn it changes, and append `**Status:** <New> YYYY-MM-DD. <Reason>`. Plans: `draft → active → done`. Issues: `open → fixed → resolved | closed` (closed needs a rationale).

## Codebase & Development Conventions
* **Prototypes:** All prototype, scratchpad and experimental code goes in `api-bird/app/dev/prototypes/` and nowhere else.
