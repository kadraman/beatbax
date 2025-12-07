// Public type declaration for TickScheduler options to aid consumers
export type TickSchedulerOptions = {
  useRaf?: boolean;
  interval?: number;
  lookahead?: number;
  raf?: (cb: FrameRequestCallback) => number;
  cancelRaf?: (id: number) => void;
  setInterval?: (handler: (...args: any[]) => void, timeout?: number, ...args: any[]) => any;
  clearInterval?: (id: any) => void;
};

export {}; // make module
