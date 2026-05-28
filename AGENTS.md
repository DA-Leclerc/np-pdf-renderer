# NP-PDF-RENDERER - Codex Rules

## Project Context
`@nordparadigm/pdf-renderer` is a shared PDF rendering library using headless Chromium and Handlebars templates. It is consumed by other Nord Paradigm products such as Radar and Breach. It is a dependency, not a deployed service. Git repo: `DA-Leclerc/np-pdf-renderer`, default branch `main`.

## Critical Rules

### 1. Changes ship through GitHub - work via pull request
GitHub `main` is the single source of truth. `main` is branch-protected: no direct pushes, and a passing CI check is required to merge.

Workflow for every change:
1. `git checkout main && git pull`
2. `git checkout -b <type>/<short-name>`
3. Make the change; `git add` specific files; `git commit`
4. `git push -u origin <branch>`
5. `gh pr create` - open a pull request
6. CI runs; merge the PR once it passes

This library does not deploy anywhere. Consumers pick up changes when they bump the dependency. There is no deploy command to run here.

### 2. Log SR&ED session outcomes in Notion
Before closing any agent session in this repo, create or update the contemporaneous SR&ED record in Notion:

- Notion database: `SR&ED R&D Log`
- Database ID: `effa36e59c89448cb57fbb1078f3ffa2`
- Data source ID: `431d42f5-7cdd-408d-8588-b28dad9191e2`

Eligible work must show technological uncertainty, systematic investigation, and knowledge gained. Use the database fields directly: `Entry`, `Project`, `Phase`, `Date`, `Technical Objective`, `Uncertainty`, `Approaches`, `Outcome`, `Tools`, `Sources`, and `Commercial Impact`. Only fill `Hours` or `Eligible Cost ($)` when known.

If the session is routine template editing, simple dependency maintenance, branch cleanup, documentation-only work, or straightforward consumer support, do not claim it as R&D. Add a short excluded entry instead so the audit trail has no gap.

### 3. The renderer is stateless - keep it that way
The pipeline receives a payload, renders a PDF buffer, and exits: no persistence, no logging of payload data. Do not add storage or payload logging. Downstream privacy guarantees in Radar and Breach depend on this.

### 4. Templates are per-product and bilingual
Templates live under `src/templates/<product>/{en,fr}.hbs` with a shared `style.css`. Any new or changed product template must ship its `en` and `fr` versions together.
