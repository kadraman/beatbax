## Contributing to BeatBax

Thanks for your interest in contributing! This short guide explains the preferred workflow and expectations to make reviews smooth.

- Keep changes small and focused. One feature or bugfix per PR.
- Add unit tests for parser/expansion behavior when changing parsing or pattern code.
- Ensure all tests pass locally before opening a PR: `npm test`.
- For quick iterative testing while developing, prefer `npm run cli:dev` (fast, no-build runner).

Spec-driven development

- Engineering behavior is specified under [`specs/`](specs/README.md). Read the [constitution](specs/constitution.md) before changing language, AST, ISM, scheduler, or plugins.
- Workflow: GitHub Feature or Spec issue → `specs/features/NNN-slug/spec.md` → `plan.md` (Constitution Check) → `tasks.md` → implementation PR.
- Assign the next `NNN` from [`specs/STATUS.md`](specs/STATUS.md). Link the issue in spec frontmatter before implementation.
- User-facing composer docs stay in [`docs/`](docs/). Do not add new feature specs under `docs/features/`.
- Templates: [`specs/_templates/`](specs/_templates/). GitHub issue forms: `.github/ISSUE_TEMPLATE/`.

Branching and PRs

- Create feature branches off `main`: `feat/<short-desc>` or `fix/<short-desc>`.
- Open a Pull Request against `main` with a clear description, rationale, and testing notes.
- Include small code examples or file snippets if the change affects the language or exports.

Testing and quality

- Unit tests use Jest and live in `tests/`. Run them with `npm test`.
- When changing code, add tests that verify expected behavior and edge cases.
- Keep the public API of modules stable; prefer additive changes.

Formatting and style

- Follow existing TypeScript style in the repository. Keep changes consistent.
- Avoid extraneous reformatting in files unrelated to your change.

Review

- A reviewer will request changes or approve; address feedback in the same PR when practical.

License

- By contributing you agree your changes will be included under the project's existing license.

Releasing

- npm packages: see [docs/releasing.md](docs/releasing.md) (`changeset` → `version-packages` → `release`).
- Desktop installers: tag `desktop-v*` for a stable GitHub Release, or merge desktop-related changes to `main` for the rolling Development pre-release; see [docs/releasing.md](docs/releasing.md).

Thanks — we appreciate your help improving BeatBax!
