/**
 * Unit tests for error-boundary utilities:
 *   withErrorBoundary, showFatalError, installGlobalErrorHandlers
 */

import {
  withErrorBoundary,
  showFatalError,
  installGlobalErrorHandlers,
} from '../src/utils/error-boundary';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

// ─── withErrorBoundary ───────────────────────────────────────────────────────

describe('withErrorBoundary()', () => {
  it('returns the result of fn when it succeeds', () => {
    const result = withErrorBoundary('Test', () => 42);
    expect(result).toBe(42);
  });

  it('returns null when fn throws', () => {
    const result = withErrorBoundary('Test', () => { throw new Error('boom'); });
    expect(result).toBeNull();
  });

  it('returns null when fn throws a non-Error value', () => {
    const result = withErrorBoundary('Test', () => { throw 'string error'; });
    expect(result).toBeNull();
  });

  it('renders an error card into the container when fn throws', () => {
    const container = document.createElement('div');
    withErrorBoundary('MyComponent', () => { throw new Error('init failed'); }, container);

    const card = container.querySelector('[data-bb-error-boundary="MyComponent"]');
    expect(card).not.toBeNull();
  });

  it('error card contains the error message', () => {
    const container = document.createElement('div');
    withErrorBoundary('Comp', () => { throw new Error('something exploded'); }, container);

    expect(container.textContent).toContain('something exploded');
  });

  it('error card contains the component label', () => {
    const container = document.createElement('div');
    withErrorBoundary('WidgetX', () => { throw new Error('oops'); }, container);

    expect(container.textContent).toContain('WidgetX');
  });

  it('error card shows a non-Error thrown value as a string', () => {
    const container = document.createElement('div');
    withErrorBoundary('Comp', () => { throw 'plain string error'; }, container);

    expect(container.textContent).toContain('plain string error');
  });

  it('does not render an error card when no container is provided', () => {
    expect(() =>
      withErrorBoundary('NoContainer', () => { throw new Error('x'); })
    ).not.toThrow();
    // Nothing should have been appended to body
    expect(document.body.innerHTML).toBe('');
  });

  it('does not render an error card when container is null', () => {
    expect(() =>
      withErrorBoundary('NullContainer', () => { throw new Error('x'); }, null)
    ).not.toThrow();
  });

  it('does not render anything to the container when fn succeeds', () => {
    const container = document.createElement('div');
    withErrorBoundary('OK', () => 'value', container);
    expect(container.innerHTML).toBe('');
  });

  it('works with object return types', () => {
    const obj = { x: 1 };
    const result = withErrorBoundary('Obj', () => obj);
    expect(result).toBe(obj);
  });
});

// ─── showFatalError ──────────────────────────────────────────────────────────

describe('showFatalError()', () => {
  it('appends #bb-fatal-error overlay to document.body', () => {
    showFatalError(new Error('fatal'));
    expect(document.getElementById('bb-fatal-error')).not.toBeNull();
  });

  it('displays the error message in the overlay', () => {
    showFatalError(new Error('startup exploded'));
    expect(document.getElementById('bb-fatal-error')!.textContent).toContain('startup exploded');
  });

  it('handles a non-Error value gracefully', () => {
    showFatalError('raw string fatal');
    expect(document.getElementById('bb-fatal-error')!.textContent).toContain('raw string fatal');
  });

  it('replaces an existing overlay rather than appending a second one', () => {
    showFatalError(new Error('first'));
    showFatalError(new Error('second'));

    const overlays = document.querySelectorAll('#bb-fatal-error');
    expect(overlays.length).toBe(1);
    expect(overlays[0].textContent).toContain('second');
  });

  it('includes a stack trace <details> block when the error has a stack', () => {
    const err = new Error('with stack');
    // jsdom populates err.stack automatically
    showFatalError(err);

    expect(document.getElementById('bb-fatal-error')!.querySelector('details')).not.toBeNull();
  });

  it('omits the stack trace block when there is no stack (non-Error)', () => {
    showFatalError('no stack here');
    expect(document.getElementById('bb-fatal-error')!.querySelector('details')).toBeNull();
  });

  it('includes a Reload button', () => {
    showFatalError(new Error('x'));
    const btn = document.getElementById('bb-fatal-error')!.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('Reload');
  });
});

// ─── installGlobalErrorHandlers ──────────────────────────────────────────────

describe('installGlobalErrorHandlers()', () => {
  it('returns a teardown function', () => {
    const teardown = installGlobalErrorHandlers(jest.fn());
    expect(typeof teardown).toBe('function');
    teardown();
  });

  it('forwards an ErrorEvent message to the callback', () => {
    const cb = jest.fn();
    const teardown = installGlobalErrorHandlers(cb);

    const err = new Error('uncaught');
    const ev = new ErrorEvent('error', { message: err.message, error: err });
    window.dispatchEvent(ev);

    expect(cb).toHaveBeenCalledWith(err.message, err);
    teardown();
  });

  it('passes the Error object as the second argument', () => {
    const cb = jest.fn();
    const teardown = installGlobalErrorHandlers(cb);

    const err = new Error('details matter');
    window.dispatchEvent(new ErrorEvent('error', { message: err.message, error: err }));

    const [, receivedError] = cb.mock.calls[0];
    expect(receivedError).toBe(err);
    teardown();
  });

  it('forwards an unhandledrejection with an Error reason', () => {
    const cb = jest.fn();
    const teardown = installGlobalErrorHandlers(cb);

    const reason = new Error('promise rejected');
    const ev = new Event('unhandledrejection');
    (ev as any).reason = reason;
    window.dispatchEvent(ev);

    expect(cb).toHaveBeenCalledWith(reason.message, reason);
    teardown();
  });

  it('forwards an unhandledrejection with a string reason', () => {
    const cb = jest.fn();
    const teardown = installGlobalErrorHandlers(cb);

    const ev = new Event('unhandledrejection');
    (ev as any).reason = 'string reason';
    window.dispatchEvent(ev);

    expect(cb).toHaveBeenCalledWith('string reason', 'string reason');
    teardown();
  });

  it('uses a generic message for unhandledrejection with an unknown reason', () => {
    const cb = jest.fn();
    const teardown = installGlobalErrorHandlers(cb);

    const ev = new Event('unhandledrejection');
    (ev as any).reason = 42;
    window.dispatchEvent(ev);

    expect(cb).toHaveBeenCalledWith('Unhandled promise rejection', 42);
    teardown();
  });

  it('stops forwarding events after the teardown is called', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const t1 = installGlobalErrorHandlers(cb1);
    const t2 = installGlobalErrorHandlers(cb2);
    t1(); // remove cb1's handler; cb2's stays active to prevent jsdom uncaught-error

    const err = new Error('after partial teardown');
    window.dispatchEvent(new ErrorEvent('error', { message: err.message, error: err }));

    expect(cb1).not.toHaveBeenCalled(); // removed — should not fire
    expect(cb2).toHaveBeenCalledWith(err.message, err); // still active
    t2();
  });

  it('multiple instances all receive the same event', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const t1 = installGlobalErrorHandlers(cb1);
    const t2 = installGlobalErrorHandlers(cb2);

    const err = new Error('broadcast');
    window.dispatchEvent(new ErrorEvent('error', { message: err.message, error: err }));

    expect(cb1).toHaveBeenCalledWith(err.message, err);
    expect(cb2).toHaveBeenCalledWith(err.message, err);
    t1(); t2();
  });
});
