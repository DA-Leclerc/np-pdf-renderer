# NP-PDF-RENDERER — Claude Code Rules

## Project Context
`@nordparadigm/pdf-renderer` is a shared PDF rendering library (headless Chromium + Handlebars templates) consumed by other Nord Paradigm products such as Radar and Brèche. It is a dependency, not a deployed service. Git repo: `DA-Leclerc/np-pdf-renderer`, default branch `main`.

## Critical Rules

### 1. Changes ship through GitHub — work via pull request
GitHub `main` is the single source of truth. `main` is branch-protected: no direct pushes, and a passing CI check is required to merge.

Workflow for every change:
1. `git checkout main && git pull`
2. `git checkout -b <type>/<short-name>`
3. Make the change; `git add` specific files; `git commit`
4. `git push -u origin <branch>`
5. `gh pr create` — open a pull request
6. CI runs; merge the PR once it passes

This library does not deploy anywhere — consumers pick up changes when they bump the dependency. There is no deploy command to run here.

### 2. The renderer is stateless — keep it that way
The pipeline receives a payload, renders a PDF buffer, and exits: no persistence, no logging of payload data. Do not add storage or payload logging — downstream privacy guarantees in Radar and Brèche depend on this.

### 3. Templates are per-product and bilingual
Templates live under `src/templates/<product>/{en,fr}.hbs` with a shared `style.css`. Any new or changed product template must ship its `en` and `fr` versions together.
