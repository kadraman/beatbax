# Spec-Driven Development (BeatBax)

Engineering behavior is specified in this tree. User-facing composer docs stay under [`docs/`](../docs/). Do not invent syntax or features that are not specified here.

This is a BeatBax-owned process (constitution, spec, plan, tasks). It is **not** GitHub Spec Kit and does not use the Specify CLI.

## When to open which GitHub issue

- **Feature** (`.github/ISSUE_TEMPLATE/feature.yml`): product idea or improvement. Labeled `enhancement` and `needs-spec`. A maintainer or agent creates `specs/features/NNN-slug/` and comments the path on the issue.
- **Specification** (`.github/ISSUE_TEMPLATE/spec.yml`): the change is already an engineering spec (language, AST, plugin contract). Labeled `spec` and `needs-spec`.
- **Bug** (`.github/ISSUE_TEMPLATE/bug.yml`): defect. If the fix changes specified behavior, update the linked spec or add a new spec folder.

## Required artifacts

Every in-flight feature lives in `specs/features/NNN-slug/` and **always** has:

| File | Role |
|------|------|
| `spec.md` | WHAT and WHY. No implementation detail. |
| `plan.md` | HOW. Includes a Constitution Check. |
| `tasks.md` | Ordered, checkable units with repo paths. |

Optional: `research.md`, `contracts/`, `checklists/`, `README.md` (pointers).

Copy from [`_templates/`](_templates/).

## Status lifecycle

`draft` → `specified` → `planned` → `in-progress` → `complete` | `superseded` | `wont-do`

- `specified`: `spec.md` is reviewable.
- `planned`: `plan.md` passes Constitution Check.
- `in-progress`: tasks are underway.
- On `complete`, move the folder to [`complete/`](complete/) and update [STATUS.md](STATUS.md).
- On `superseded` or `wont-do`, move to [`archive/`](archive/).

## Numbering and branches

1. Assign the next integer `NNN` from [STATUS.md](STATUS.md).
2. Folder and branch: `feat/NNN-slug` (fixes: `fix/NNN-slug` when a spec exists).
3. Put the GitHub issue URL in `spec.md` frontmatter (`issue:`) **before** implementation PRs.

## Traceability

Implementation PRs for `enhancement` / `spec` issues MUST link `spec.md` (and the issue). Feature work also links `plan.md` and `tasks.md`. Trivial docs/chores that do not change language or user-visible behavior may skip this with a one-line justification.

## What agents must read

1. [constitution.md](constitution.md)
2. Relevant files in [global/](global/)
3. The **active** feature folder (do not load all of `complete/` by default)
4. [STATUS.md](STATUS.md) to find related shipped specs, then open only those paths

Shipped specs under `specs/complete/` remain authoritative for implemented behavior. Use [STATUS.md](STATUS.md) to find them — do not load the entire complete tree by default.
