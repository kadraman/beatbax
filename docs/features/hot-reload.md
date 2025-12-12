# Real-time Pattern Hot Reload

**Status:** Proposed (high-priority developer experience feature)

## Summary

Enable real-time updates to playing songs without stopping playback. When the user edits source code, BeatBax should recompile, diff the changes, and seamlessly update the playing sequence with minimal latency and no audio glitches.

## Motivation

- **Live coding**: Essential for live performance and creative exploration
- **Rapid iteration**: Hear changes immediately without stop/restart cycle
- **Flow state**: Maintain creative momentum without interruptions
- **Demo value**: Showcase BeatBax's live coding capabilities in the web UI

## Current State

- Demo has a "Live" checkbox that triggers recompilation on text changes
- Recompilation works but has issues:
  - Full stop/restart causes audio glitch
  - High latency between edit and audio update (~500ms+)
  - No smooth transition between old and new patterns
  - Channel state is lost on reload
- Debounce delay is fixed (no tuning options)

## Problems with Current Implementation

```typescript
// demo/boot.ts (current approach)
const liveApply = debounce(async () => {
  if (player) player.stop();           // ❌ Hard stop causes glitch
  const ast = parse(src);               // ❌ Full reparse every time
  const resolved = resolveSong(ast);    // ❌ Full resolution
  player.playAST(resolved);             // ❌ Cold start
}, 300);
```

**Issues:**
- Full stop clears scheduler queue and kills all audio nodes
- No diff checking (even unchanged patterns are reloaded)
- Cold start means initial notes might be missed or delayed
- No state preservation (mute/solo settings reset)

## Proposed Solution

### Architecture Overview

```
User Edit → Debounce → Parse → Diff → Patch → Scheduler Update
                                  ↓
                          Unchanged patterns continue playing
```

### Key Components

1. **Smart Diffing**: Compare new AST against current AST to find changes
2. **Hot Patching**: Update only changed patterns/instruments in-place
3. **Scheduler Continuity**: Keep scheduler running, update event queue
4. **State Preservation**: Maintain mute/solo/channel state across updates

### 1. AST Diffing

```typescript
// packages/engine/src/runtime/diff.ts
export interface ASTDiff {
  addedInstruments: string[];
  removedInstruments: string[];
  modifiedInstruments: string[];
  
  addedPatterns: string[];
  removedPatterns: string[];
  modifiedPatterns: string[];
  
  addedSequences: string[];
  removedSequences: string[];
  modifiedSequences: string[];
  
  channelChanges: Map<number, ChannelChange>;
  
  globalChanges: {
    bpm?: number;
    chip?: string;
    tempo?: number;
  };
}

export function diffAST(oldAST: AST, newAST: AST): ASTDiff {
  const diff: ASTDiff = {
    addedInstruments: [],
    removedInstruments: [],
    modifiedInstruments: [],
    // ... etc
  };
  
  // Compare instruments
  const oldInsts = new Map(oldAST.instruments.map(i => [i.name, i]));
  const newInsts = new Map(newAST.instruments.map(i => [i.name, i]));
  
  for (const [name, newInst] of newInsts) {
    if (!oldInsts.has(name)) {
      diff.addedInstruments.push(name);
    } else if (!deepEqual(oldInsts.get(name), newInst)) {
      diff.modifiedInstruments.push(name);
    }
  }
  
  for (const [name] of oldInsts) {
    if (!newInsts.has(name)) {
      diff.removedInstruments.push(name);
    }
  }
  
  // Compare patterns, sequences, channels similarly...
  
  return diff;
}
```

### 2. Hot Patch Application

```typescript
// packages/engine/src/runtime/hotReload.ts
export class HotReloadManager {
  private currentAST: AST | null = null;
  private player: Player;
  
  constructor(player: Player) {
    this.player = player;
  }
  
  async update(newSource: string): Promise<HotReloadResult> {
    try {
      const newAST = parse(newSource);
      
      if (!this.currentAST) {
        // First load: just play normally
        this.currentAST = newAST;
        await this.player.playAST(newAST);
        return { success: true, coldStart: true };
      }
      
      // Compute diff
      const diff = diffAST(this.currentAST, newAST);
      
      // Check if we need a full restart (breaking changes)
      if (this.requiresRestart(diff)) {
        await this.fullRestart(newAST);
        this.currentAST = newAST;
        return { success: true, fullRestart: true };
      }
      
      // Apply hot patches
      await this.applyPatches(diff, newAST);
      this.currentAST = newAST;
      
      return { 
        success: true, 
        patchesApplied: true,
        diff 
      };
      
    } catch (error) {
      return { success: false, error };
    }
  }
  
  private requiresRestart(diff: ASTDiff): boolean {
    // Restart if chip changes or channel count changes
    return !!(
      diff.globalChanges.chip ||
      diff.channelChanges.size > 0 && 
      Array.from(diff.channelChanges.values()).some(c => c.type === 'removed')
    );
  }
  
  private async applyPatches(diff: ASTDiff, newAST: AST) {
    // Update instruments (affects future notes only)
    for (const name of diff.modifiedInstruments) {
      const inst = newAST.instruments.find(i => i.name === name);
      if (inst) {
        this.player.updateInstrument(name, inst);
      }
    }
    
    // Update patterns (re-expand and swap in scheduler)
    for (const name of diff.modifiedPatterns) {
      const pat = newAST.patterns.find(p => p.name === name);
      if (pat) {
        await this.player.updatePattern(name, pat);
      }
    }
    
    // Update sequences (re-resolve and patch channel event queues)
    for (const [chId, change] of diff.channelChanges) {
      if (change.type === 'modified') {
        await this.player.updateChannelSequence(chId, change.newSequence);
      }
    }
    
    // Update global tempo
    if (diff.globalChanges.bpm) {
      this.player.setBPM(diff.globalChanges.bpm);
    }
  }
}
```

### 3. Player API Updates

```typescript
// src/audio/playback.ts
export class Player {
  // ... existing methods ...
  
  /**
   * Update instrument definition without stopping playback.
   * Affects notes scheduled after this call.
   */
  updateInstrument(name: string, inst: InstrumentNode): void {
    this.instruments.set(name, inst);
    // Future scheduled notes will use new instrument
  }
  
  /**
   * Update a pattern definition and re-schedule affected events.
   * Smoothly transitions from old to new pattern at next loop point.
   */
  async updatePattern(name: string, pattern: PatternNode): Promise<void> {
    // Find all channels using this pattern
    const affectedChannels = this.findChannelsUsingPattern(name);
    
    for (const chId of affectedChannels) {
      // Wait for current pattern iteration to complete
      const nextLoopTime = this.getNextLoopPoint(chId);
      
      // Expand new pattern
      const expanded = expandPattern(pattern, /* context */);
      
      // Schedule transition
      this.scheduler.schedule(nextLoopTime, () => {
        this.swapChannelEvents(chId, expanded);
      });
    }
  }
  
  /**
   * Update channel sequence (pattern order) at next safe point.
   */
  async updateChannelSequence(chId: number, sequence: SequenceNode): Promise<void> {
    const resolved = resolveSequence(sequence, this.patterns, this.instruments);
    const nextLoopTime = this.getNextLoopPoint(chId);
    
    this.scheduler.schedule(nextLoopTime, () => {
      this.channels[chId].eventQueue = resolved.events;
      this.channels[chId].currentIndex = 0;
    });
  }
  
  /**
   * Change BPM smoothly without stopping playback.
   */
  setBPM(bpm: number): void {
    this.bpm = bpm;
    this.tickDuration = 60 / (bpm * this.ticksPerBeat);
    // Reschedule future events with new timing
    this.rescheduleUpcomingEvents();
  }
  
  private getNextLoopPoint(chId: number): number {
    // Find when current pattern/bar completes
    const ch = this.channels[chId];
    const currentTime = this.ctx.currentTime;
    
    // Calculate next bar boundary
    const barDuration = this.getBarDuration();
    const timeSinceStart = currentTime - this.startTime;
    const currentBar = Math.floor(timeSinceStart / barDuration);
    const nextBarTime = this.startTime + ((currentBar + 1) * barDuration);
    
    return nextBarTime;
  }
}
```

### 4. UI Integration

```typescript
// demo/boot.ts (updated)
import { HotReloadManager } from 'packages/engine/src/runtime/hotReload';

let hotReloadManager: HotReloadManager | null = null;

const liveApply = debounce(async () => {
  if (!liveCheckbox?.checked) return;
  
  try {
    status.textContent = 'Live update...';
    
    const src = srcArea.value;
    
    // Initialize hot reload manager if needed
    if (!hotReloadManager || !player) {
      player = new Player();
      hotReloadManager = new HotReloadManager(player);
    }
    
    // Apply hot update
    const result = await hotReloadManager.update(src);
    
    if (result.success) {
      if (result.coldStart) {
        status.textContent = 'Playing (cold start)';
      } else if (result.fullRestart) {
        status.textContent = 'Playing (full restart)';
      } else {
        status.textContent = `Live (${result.diff?.modifiedPatterns.length || 0} changes)`;
      }
    } else {
      status.textContent = `Error: ${result.error?.message}`;
      console.error(result.error);
    }
    
  } catch (e) {
    console.error('Live update failed:', e);
    status.textContent = 'Live update failed';
  }
}, 200); // Reduced debounce for better responsiveness
```

### 5. Visual Feedback

```typescript
// demo/boot.ts
function showPatchIndicator(diff: ASTDiff) {
  // Flash indicator for each changed element
  if (diff.modifiedPatterns.length > 0) {
    flashElement('.pattern-indicator', 'lime');
  }
  if (diff.modifiedInstruments.length > 0) {
    flashElement('.instrument-indicator', 'cyan');
  }
  if (diff.globalChanges.bpm) {
    flashElement('.tempo-indicator', 'yellow');
  }
}

function flashElement(selector: string, color: string) {
  const el = document.querySelector(selector);
  if (!el) return;
  
  el.style.backgroundColor = color;
  setTimeout(() => {
    el.style.backgroundColor = '';
  }, 200);
}
```

## Advanced Features

### 1. Undo/Redo for Live Edits

```typescript
class EditHistory {
  private history: AST[] = [];
  private currentIndex = 0;
  
  push(ast: AST) {
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push(ast);
    this.currentIndex++;
  }
  
  undo(): AST | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }
    return null;
  }
  
  redo(): AST | null {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    }
    return null;
  }
}
```

### 2. Sync to Beat Grid

Wait for next beat/bar before applying patch (avoids mid-note updates):

```typescript
async updateOnNextBeat(callback: () => void) {
  const nextBeatTime = this.getNextBeatTime();
  this.scheduler.schedule(nextBeatTime, callback);
}
```

### 3. Preview Mode

Show what will change before applying:

```typescript
function previewChanges(diff: ASTDiff): string {
  return `
    ${diff.modifiedPatterns.length} patterns will update
    ${diff.modifiedInstruments.length} instruments will update
    ${diff.channelChanges.size} channels will change
  `;
}
```

## Performance Optimizations

1. **Incremental Parsing**: Only re-parse changed lines (future)
2. **Memoization**: Cache expanded patterns to avoid redundant work
3. **Lazy Evaluation**: Defer updates until next play point
4. **Web Worker**: Move parsing/diffing to background thread (future)

## Testing Strategy

### Unit Tests

```typescript
// tests/hotReload.test.ts
describe('Hot Reload', () => {
  test('detects modified patterns', () => {
    const oldAST = parse('pat A = C4 E4 G4');
    const newAST = parse('pat A = C4 F4 A4');
    const diff = diffAST(oldAST, newAST);
    
    expect(diff.modifiedPatterns).toContain('A');
  });
  
  test('preserves playback state on pattern update', async () => {
    const player = new Player();
    const manager = new HotReloadManager(player);
    
    await manager.update('pat A = C4 E4\nchannel 1 => inst lead pat A\nplay');
    expect(player.isPlaying()).toBe(true);
    
    await manager.update('pat A = D4 F4\nchannel 1 => inst lead pat A\nplay');
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
    bpm 120
    inst lead type=pulse1 duty=50
    pat A = C4 C4 C4 C4
    channel 1 => inst lead pat A
    play
  `);
  
  // Simulate edit after 2 seconds
  setTimeout(async () => {
    await manager.update(`
      bpm 120
      inst lead type=pulse1 duty=50
      pat A = E4 E4 E4 E4
      channel 1 => inst lead pat A
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

## Implementation Checklist

- [ ] Create `packages/engine/src/runtime/diff.ts` with `diffAST()` function
- [ ] Create `packages/engine/src/runtime/hotReload.ts` with `HotReloadManager` class
- [ ] Add `updateInstrument()` method to Player
- [ ] Add `updatePattern()` method to Player
- [ ] Add `updateChannelSequence()` method to Player
- [ ] Add `setBPM()` method to Player
- [ ] Add `getNextLoopPoint()` helper to Player
- [ ] Update demo `boot.ts` to use HotReloadManager
- [ ] Add visual feedback for live updates in UI
- [ ] Write unit tests for AST diffing
- [ ] Write unit tests for hot reload manager
- [ ] Write integration tests for glitch-free updates
- [ ] Update TUTORIAL.md with live coding examples
- [ ] Add keyboard shortcut for manual apply (Ctrl+Enter)
- [ ] Document hot reload API in engine README

## User Experience

### Before (Current)
```
User types → Debounce (300ms) → Full stop → Parse → Play → Audio glitch ❌
```

### After (Hot Reload)
```
User types → Debounce (200ms) → Parse → Diff → Patch → Seamless update ✅
```

**Improvement:**
- ~40% faster response time (300ms → 200ms debounce)
- No audio glitches on pattern changes
- State preserved (mute/solo settings)
- Visual feedback shows what changed

## Breaking Changes

None. Hot reload is an opt-in enhancement to the existing live mode.

## Success Metrics

- ✅ Pattern updates apply within 300ms of keystroke
- ✅ No audible glitches during hot reload
- ✅ Mute/solo state preserved across updates
- ✅ CPU usage remains stable during live editing
- ✅ Updates sync to beat grid (no mid-note transitions)

## Future Enhancements

- **Collaborative editing**: Multiple users edit same song in real-time
- **Time travel debugging**: Scrub through edit history while maintaining playback
- **Visual diff view**: Show before/after comparison in UI
- **Smart suggestions**: Auto-complete patterns based on edit context

## See Also

- [monorepo-refactoring.md](./monorepo-refactoring.md) - Web UI package structure
- [TUTORIAL.md](../../TUTORIAL.md) - Live coding workflow examples
- [demo/](../../demo/) - Current demo implementation
