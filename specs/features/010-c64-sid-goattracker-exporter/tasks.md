# Tasks: C64 SID GoatTracker Exporter Plugin

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Migrated checklist (normalize to `Tnnn` format as work proceeds):

## Implementation Checklist

- [ ] Create `@beatbax/plugin-exporter-goattracker` package
- [ ] Freeze the exact v1 output artifact and naming
- [ ] Implement SID-to-tracker lowering
- [ ] Implement pattern/order/instrument conversion
- [ ] Add validation for unsupported mappings
- [ ] Add deterministic export tests
