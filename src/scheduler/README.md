# TickScheduler

`TickScheduler` is a deterministic tick scheduler used by playback engines in BeatBax. It supports
both interval-based and requestAnimationFrame-based ticking, and allows injection of timer functions
for improved testability and for use in non-browser environments.

## Options (TickSchedulerOptions)

- `useRaf?: boolean` — If true, prefer an RAF-driven loop when available. Default: `false`.
- `interval?: number` — Interval in milliseconds used by the interval loop. Default: `25`.
- `lookahead?: number` — Lookahead in seconds used to decide which scheduled callbacks to fire. Default: `0.1`.
- `raf?: (cb: FrameRequestCallback) => number` — Injected `requestAnimationFrame` function (useful for tests or non-browser hosts).
- `cancelRaf?: (id: number) => void` — Injected `cancelAnimationFrame` function.
- `setInterval?: (handler, timeout) => any` — Injected `setInterval` implementation.
- `clearInterval?: (id) => void` — Injected `clearInterval` implementation.

## Usage

Factory usage (default)

```ts
import createScheduler from './index';
const sched = createScheduler(audioContext); // prefers RAF in browser
sched.start();
sched.schedule(audioTime, () => { /* play note */ });
```

RequestAnimationFrame mode (explicit)

```ts
import createScheduler from './index';
const sched = createScheduler(audioContext, { useRaf: true });
sched.start();
```

Injection example (tests)

```ts
let stored: Function | null = null;
const fakeRaf = (cb: FrameRequestCallback) => { stored = cb; return 1; };
const fakeCancel = jest.fn();
const sched = createScheduler(ctx, { useRaf: true, raf: fakeRaf, cancelRaf: fakeCancel });
// call stored() to simulate RAF frame
```

The scheduler is intentionally small and focused: it only queues timed callbacks and executes them
when their scheduled time is within `now + lookahead`. This keeps scheduling deterministic and
consistent across audio backends.
