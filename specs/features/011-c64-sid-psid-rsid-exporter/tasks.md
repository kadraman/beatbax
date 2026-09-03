# Tasks: C64 SID PSID/RSID Exporter Plugin

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Migrated checklist (normalize to `Tnnn` format as work proceeds):

## Implementation Checklist

- [ ] Create `@beatbax/plugin-exporter-sid` package
- [ ] Implement PSID header writer
- [ ] Implement RSID header writer/validation
- [ ] Implement SID-target lowering for exporter use
- [ ] Map BeatBax metadata into SID metadata
- [ ] Add deterministic export tests
