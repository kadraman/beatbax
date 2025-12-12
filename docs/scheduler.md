# Scheduler (TickScheduler) - Usage Guide

This document provides a quick reference and usage examples for the deterministic tick scheduler used by BeatBax.

The scheduler provides a small, deterministic API to schedule callbacks at precise audio times. In browser environments it uses a RAF-driven loop by default; in Node or headless contexts it can be driven by the host application.

## Example

```ts
// ESM import from published package
import createScheduler from 'beatbax/scheduler';

// `audioContext` is a WebAudio AudioContext instance
const sched = createScheduler(audioContext, { useRaf: true });
sched.start();

// schedule a callback at a specific audio time
sched.schedule(audioContext.currentTime + 0.1, () => {
  // play a scheduled note or trigger event
});

// Types are exported for TS consumers
import type { TickSchedulerOptions } from 'beatbax/scheduler';
```

## Options

The scheduler accepts configuration options:

```typescript
interface TickSchedulerOptions {
  useRaf?: boolean;        // Use requestAnimationFrame (default: true in browsers)
  lookahead?: number;      // Lookahead window in seconds (default: 0.1)
  scheduleInterval?: number; // Scheduling interval in ms (default: 25)
}
```

## Notes

- **Default behavior**: In browser environments, the scheduler uses `requestAnimationFrame` to drive its polling loop and maintains a small lookahead window so scheduled callbacks are fired with accurate audio timing.
- **Clearing callbacks**: Use the scheduler's `clear()` or `stop()` methods to cancel scheduled callbacks (see source in `packages/engine/src/scheduler/` for API details).
- **Audio timing**: Always pass absolute audio times from `AudioContext.currentTime` rather than wall-clock time — this ensures sample-accurate playback across different environments.
- **Deterministic**: The scheduler processes events in time order, making playback repeatable and testable.

## Where it is used

- The scheduler is the timing foundation for the Player (`packages/engine/src/audio/playback.ts`) and powers the demo (`demo/`).
- For examples of integration with the Player and how sequences are expanded into timed events, see the demo implementation.
- All unit tests mock or stub the scheduler to verify timing-dependent behavior without real audio hardware.

## API Methods

```typescript
interface TickScheduler {
  start(): void;                          // Start the scheduler loop
  stop(): void;                           // Stop and clear all scheduled callbacks
  schedule(time: number, fn: () => void): void;  // Schedule a callback at absolute audio time
  clear(): void;                          // Clear all pending callbacks
}
```

For a more detailed API reference including exported types and advanced options, see `packages/engine/src/scheduler/README.md` or inspect the TypeScript definitions in `packages/engine/src/scheduler/index.ts`.

## See Also

- [packages/engine/src/scheduler/README.md](../packages/engine/src/scheduler/README.md) - Detailed scheduler API documentation
- [DEVNOTES.md](../DEVNOTES.md) - Architecture and implementation notes
