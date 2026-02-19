/**
 * Unit tests for EventBus
 */

import { EventBus } from '../src/utils/event-bus';
import { createLogger } from '@beatbax/engine/util/logger';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
    jest.clearAllMocks(); // Clear mock call history between tests
  });

  afterEach(() => {
    bus.clear();
  });

  describe('on() and emit()', () => {
    it('should subscribe and receive events', () => {
      const callback = jest.fn();
      bus.on('editor:changed', callback);
      
      const data = { content: 'test content' };
      bus.emit('editor:changed', data);
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(data);
    });

    it('should support multiple subscribers', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      bus.on('playback:started', callback1);
      bus.on('playback:started', callback2);
      
      bus.emit('playback:started', undefined);
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should call callback with correct data', () => {
      const callback = jest.fn();
      bus.on('parse:error', callback);
      
      const error = new Error('parse failed');
      const data = { error, message: 'Parse error' };
      bus.emit('parse:error', data);
      
      expect(callback).toHaveBeenCalledWith(data);
      expect(callback.mock.calls[0][0].error.message).toBe('parse failed');
    });
  });

  describe('once()', () => {
    it('should auto-unsubscribe after first call', () => {
      const callback = jest.fn();
      bus.once('playback:stopped', callback);
      
      bus.emit('playback:stopped', undefined);
      bus.emit('playback:stopped', undefined);
      bus.emit('playback:stopped', undefined);
      
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('off()', () => {
    it('should unsubscribe specific callback', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      bus.on('editor:saved', callback1);
      bus.on('editor:saved', callback2);
      
      bus.off('editor:saved', callback1);
      
      bus.emit('editor:saved', { filename: 'test.bax' });
      
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should remove all listeners when no callback provided', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      bus.on('theme:changed', callback1);
      bus.on('theme:changed', callback2);
      
      bus.off('theme:changed');
      
      bus.emit('theme:changed', { theme: 'dark' });
      
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('on() return value (unsubscribe function)', () => {
    it('should return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = bus.on('playback:started', callback);
      
      bus.emit('playback:started', undefined);
      expect(callback).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      bus.emit('playback:started', undefined);
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });

  describe('clear()', () => {
    it('should remove all listeners', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      bus.on('editor:changed', callback1);
      bus.on('playback:started', callback2);
      
      bus.clear();
      
      bus.emit('editor:changed', { content: 'test' });
      bus.emit('playback:started', undefined);
      
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount()', () => {
    it('should return correct listener count', () => {
      expect(bus.listenerCount('editor:changed')).toBe(0);
      
      const unsubscribe1 = bus.on('editor:changed', () => {});
      expect(bus.listenerCount('editor:changed')).toBe(1);
      
      bus.on('editor:changed', () => {});
      expect(bus.listenerCount('editor:changed')).toBe(2);
      
      unsubscribe1();
      expect(bus.listenerCount('editor:changed')).toBe(1);
    });
  });

  describe('eventNames()', () => {
    it('should return all event names with listeners', () => {
      expect(bus.eventNames()).toEqual([]);
      
      bus.on('editor:changed', () => {});
      bus.on('playback:started', () => {});
      
      const names = bus.eventNames();
      expect(names).toContain('editor:changed');
      expect(names).toContain('playback:started');
      expect(names.length).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should catch and log errors in callbacks', () => {
      // Get the mocked logger that EventBus uses
      const log = createLogger('ui:event-bus');
      const callback1 = jest.fn(() => {
        throw new Error('callback error');
      });
      const callback2 = jest.fn();
      
      bus.on('editor:changed', callback1);
      bus.on('editor:changed', callback2);
      
      bus.emit('editor:changed', { content: 'test' });
      
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled(); // Should still be called
      expect(log.error).toHaveBeenCalled();
    });
  });

  describe('type safety', () => {
    it('should enforce correct event data types', () => {
      // This is a compile-time check, but we can verify runtime behavior
      const callback = jest.fn();
      bus.on('export:success', callback);
      
      const data = { format: 'json', filename: 'test.json' };
      bus.emit('export:success', data);
      
      expect(callback).toHaveBeenCalledWith(data);
    });
  });
});
