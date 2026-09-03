# Implementation Plan: Real-time Pattern Hot Reload

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Testing Strategy

### Unit Tests

```typescript
// tests/hotReload.test.ts
describe('Hot Reload', () => {
  test('detects modified patterns', () => {
    const oldAST = parse('pat melody = C4 E4 G4');
    const newAST = parse('pat melody = C4 F4 A4');
    const diff = diffAST(oldAST, newAST);

    expect(diff.modifiedPatterns).toContain('melody');
  });

  test('preserves playback state on pattern update', async () => {
    const player = new Player();
    const manager = new HotReloadManager(player);

    await manager.update('pat melody = C4 E4\nchannel 1 => inst lead pat melody\nplay');
    expect(player.isPlaying()).toBe(true);

    await manager.update('pat melody = D4 F4\nchannel 1 => inst lead pat melody\nplay');
    expect(player.isPlaying()).toBe(true); // Still playing!
  });
});
```

### Integration Tests

```typescript
// tests/hotReload.integration.test.ts
test('updates pattern without audio glitch', async () => {
  const ctx = new OfflineAudioContext(1, 44100 * 10, 44100);
  const player = new Player(ctx);
  const manager = new HotReloadManager(player);

  await manager.update(`
    bpm 128
    inst lead type=pulse1 duty=50
    pat melody = C4 C4 C4 C4
    channel 1 => inst lead pat melody
    play
  `);

  // Simulate edit after 2 seconds
  setTimeout(async () => {
    await manager.update(`
      bpm 128
      inst lead type=pulse1 duty=50
      pat melody = E4 E4 E4 E4
      channel 1 => inst lead pat melody
      play
    `);
  }, 2000);

  // Render and check for audio continuity (no gaps/clicks)
  await ctx.startRendering();
  const buffer = ctx.getChannelData(0);

  // Verify no zero-amplitude gaps (would indicate glitch)
  let hasGlitch = false;
  for (let i = 44100; i < buffer.length - 4410; i++) {
    const window = buffer.slice(i, i + 4410); // 100ms window
    const allZero = window.every(s => Math.abs(s) < 0.001);
    if (allZero) {
      hasGlitch = true;
      break;
    }
  }

  expect(hasGlitch).toBe(false);
});
```
