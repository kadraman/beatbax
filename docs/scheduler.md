# Scheduler (TickScheduler) — usage

This document provides a short example and notes for the deterministic tick scheduler used by BeatBax.

The scheduler provides a small, deterministic API to schedule callbacks at precise audio times. In browser environments
it uses a RAF-driven loop by default; in Node or headless contexts it can be driven differently by the host.

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

## Notes

- Default behavior: in browser, the scheduler uses requestAnimationFrame to drive its polling loop and keeps a small
  lookahead window so scheduled callbacks are fired with accurate audio timing.
- To cancel scheduled callbacks, use the scheduler's clear/stop APIs provided by the implementation (see source in
  `src/scheduler/`).
- When scheduling audio events, prefer passing absolute audio times from `AudioContext.currentTime` rather than
  wall-clock time — this ensures sample-accurate playback across different environments.

## Where it is used

- The scheduler is the timing foundation for the Player (`src/audio/playback.ts`) and the demo (`demo/`).
- For examples of how to integrate it with the Player and how sequences are expanded into timed events see `demo/`.

If you need a more detailed API reference (options, exported types), open `src/scheduler/README.md` or inspect the
TypeScript exports in `src/scheduler`.
