# Tasks: Performance Mode Video Recording

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Migrated checklist (normalize to `Tnnn` format as work proceeds):

## Implementation Checklist

- [ ] `Player.getOutputNode()` (or equivalent) + safe record tap attach/detach
- [ ] StorageKeys + settings atoms for all recording options
- [ ] General Settings → Performance recording UI (desktop)
- [ ] `performance-recorder` compositor (bg + waves + optional HUD)
- [ ] Title card overlay in compositor
- [ ] WebCodecs MP4 path (`mp4-muxer`)
- [ ] WebCodecs WebM path (`webm-muxer`)
- [ ] Record button on normal visualizer toolbar (enter PM; restart from beginning; loop off; play once; auto-stop record on song end)
- [ ] Record/Stop + indicator in performance toolbar (same one-shot transport rules)
- [ ] Restore prior loop / transport preferences after the take ends (optional but preferred)
- [ ] Save: ask / last-folder / fixed-folder (+ directory IPC)
- [ ] Exit-while-recording finalize + save
- [ ] Manual verification matrix
- [ ] Mark this doc `status: implemented` when shipped

---
