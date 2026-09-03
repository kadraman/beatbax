# Tasks: <TITLE>

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [ ] T001 …

**Checkpoint**: foundation complete before user-story work.

## Phase 1: User Story 1 — <title> (P1)

- [ ] T010 [US1] …

**Checkpoint**: story independently testable.

## Phase 2: User Story 2 — <title> (P2)

- [ ] T020 [US2] …

## Polish

- [ ] T900 Update user-facing docs under `docs/` if composers are affected
- [ ] T901 Move this folder to `specs/complete/NNN-slug/` and update `specs/STATUS.md` when shipped
