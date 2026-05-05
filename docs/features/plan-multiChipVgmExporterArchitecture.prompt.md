## Plan: Multi-Chip VGM Exporter Architecture

Refactor the current VGM exporter into one global dispatcher plugin that routes to chip-specific VGM backends. This keeps exporter registration stable (single vgm id), preserves current SMS determinism, and allows adding AY-3-8910 and later chips without engine API changes.

**Steps**
1. Phase 1: Spec alignment
Update `docs/features/vgm-exporter-plugin.md` to define backend-dispatch architecture and a support matrix (SMS enabled, AY planned).
Set explicit scope: single-chip songs only; mixed-chip VGM export excluded for now.

2. Phase 2: Extract backend contract (depends on 1)
In `packages/plugins/export-vgm/src/index.ts`, introduce an internal backend interface (chip aliases, validate, translate, GD3 hints).
Wrap existing SMS logic from `packages/plugins/export-vgm/src/ismToVgm.ts` behind an SMS backend module.

3. Phase 3: Generalize VGM header model (depends on 2)
Extend header params in `packages/plugins/export-vgm/src/vgmWriter.ts` so additional chip clocks can be set later, while keeping SMS byte output identical today.
Add near-term chip header constants in `packages/plugins/export-vgm/src/constants.ts`.

4. Phase 4: Entry-point dispatch refactor (depends on 2,3)
Replace hardcoded SMS checks in `packages/plugins/export-vgm/src/index.ts` with normalized chip-to-backend lookup.
Make validate and export use the same backend resolution path to avoid divergence bugs.
Build supported chips list dynamically from registered backends.

5. Phase 5: Plugin wiring and compatibility (parallel with 4)
Keep one exporter id only (vgm). Do not change exporter uniqueness behavior in `packages/engine/src/export/registry.ts`.
Keep current duplicate-safe chip registration behavior in `packages/engine/src/chips/registry.ts`.
Retain SMS plugin resolver flow in `packages/plugins/chip-sms/src/index.ts`.
Update web UI registry config and menu/toolbar to reflect single VGM exporter with chip-specific backends (not tied specifically to SMS).

6. Phase 6: Tests and regression gates (depends on 4,5)
Update `packages/plugins/export-vgm/tests/vgm-exporter.test.ts` for backend dispatch, alias resolution, unsupported-chip diagnostics, and validate/export parity.
Update `packages/plugins/export-vgm/tests/vgmWriter.test.ts` to verify header generalization does not alter SMS output bytes.
Keep existing SMS determinism/golden outputs unchanged.

7. Phase 7: AY readiness (after architecture lands)
Add AY backend scaffold as disabled/unsupported until fully implemented, or do AY in a separate PR for lower risk.
Enable AY only after docs + tests + fixture coverage are complete.

**Relevant files**
- `packages/plugins/export-vgm/src/index.ts`
- `packages/plugins/export-vgm/src/ismToVgm.ts`
- `packages/plugins/export-vgm/src/vgmWriter.ts`
- `packages/plugins/export-vgm/src/constants.ts`
- `packages/plugins/export-vgm/tests/vgm-exporter.test.ts`
- `packages/plugins/export-vgm/tests/vgmWriter.test.ts`
- `packages/plugins/chip-sms/src/index.ts`
- `packages/engine/src/chips/registry.ts`
- `packages/engine/src/export/registry.ts`
- `apps/web-ui/src/plugins/exporter-registry-config.ts`
- `apps/web-ui/src/ui/menu-bar.ts`
- `apps/web-ui/src/ui/toolbar.ts`
- `docs/features/vgm-exporter-plugin.md`

**Verification**
1. Run export-vgm tests and confirm current SMS tests pass unchanged.
2. Run engine registry tests and confirm exporter uniqueness behavior is unchanged.
3. CLI checks: list-exporters and export vgm on SMS fixtures.
4. Determinism gate: compare SMS VGM output hashes/sizes before vs after refactor.
5. Confirm unsupported chips fail loudly with a clear "available VGM backends" diagnostic.

**Key decisions baked into this plan**
- One global vgm exporter id with internal chip dispatch.
- No engine ExporterPlugin API change in this migration.
- Strict fail on unsupported chip/features; no fallback behavior.
- Mixed-chip songs remain out of scope for this iteration.

**Open questions / further refinement needed**
- Backend packaging strategy: Option A — internal backends in one package (simpler, recommended now). Option B — optional per-chip VGM backend packages discovered dynamically (more modular, adds dependency/load complexity).
- AY rollout strategy: Option A — ship architecture refactor first, AY in follow-up PR (lower risk). Option B — land architecture + AY together (faster feature delivery, higher review/test surface).
- Header breadth strategy: Option A — add only fields required by near-term chips (AY/YM2413) now. Option B — predefine broad VGM header map up front for long-term chip families.
