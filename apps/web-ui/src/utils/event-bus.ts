/**
 * Event bus for cross-component communication
 * Type-safe pub/sub event system
 */

import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:event-bus');

// Event type definitions
export interface BeatBaxEvents {
  // Editor events
  'editor:changed': { content: string };
  'editor:saved': { filename: string };

  // Parse events
  'parse:started': void;
  'parse:success': { ast: any };
  'parse:error': { error: Error; message: string };

  // Playback events
  'playback:started': void;
  'playback:stopped': void;
  'playback:repeated': void;
  'playback:paused': void;
  'playback:resumed': void;
  'playback:error': { error: Error };
  'playback:position': { current: number; total: number };
  // Phase 2.5: Real-time position tracking
  'playback:position-changed': { channelId: number; position: any };

  // Export events
  'export:started': { format: string };
  'export:success': { format: string; filename: string };
  'export:error': { format: string; error: Error };

  // UI events
  'theme:changed': { theme: 'dark' | 'light' };
  'panel:toggled': { panel: string; visible: boolean };
  'layout:changed': { layout: string };

  // Channel events
  'channel:muted': { channel: number };
  'channel:soloed': { channel: number };
  'channel:unmuted': { channel: number };
  'channel:unsoloed': { channel: number };

  // Validation events
  'validation:warnings': { warnings: Array<{ component: string; message: string; file?: string; loc?: any }> };
  'validation:errors': { errors: Array<{ message: string; loc?: any }> };
}

type EventCallback<T> = (data: T) => void;
type EventName = keyof BeatBaxEvents;

/**
 * EventBus class - lightweight pub/sub system
 */
export class EventBus {
  private listeners: Map<EventName, Set<EventCallback<any>>> = new Map();

  /**
   * Subscribe to an event
   * @param eventName The event to listen for
   * @param callback The callback to invoke when the event is emitted
   * @returns Unsubscribe function
   */
  on<K extends EventName>(
    eventName: K,
    callback: EventCallback<BeatBaxEvents[K]>
  ): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    const callbacks = this.listeners.get(eventName)!;
    callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(eventName);
      }
    };
  }

  /**
   * Subscribe to an event (once)
   * Automatically unsubscribes after first invocation
   * @param eventName The event to listen for
   * @param callback The callback to invoke when the event is emitted
   */
  once<K extends EventName>(
    eventName: K,
    callback: EventCallback<BeatBaxEvents[K]>
  ): void {
    const unsubscribe = this.on(eventName, (data) => {
      unsubscribe();
      callback(data);
    });
  }

  /**
   * Emit an event
   * @param eventName The event to emit
   * @param data The data to pass to listeners
   */
  emit<K extends EventName>(eventName: K, data: BeatBaxEvents[K]): void {
    const callbacks = this.listeners.get(eventName);
    if (!callbacks) return;

    // Call all callbacks with the provided data
    callbacks.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        log.error(`Error in event listener for ${eventName}:`, error);
      }
    });
  }

  /**
   * Unsubscribe from an event
   * @param eventName The event to unsubscribe from
   * @param callback The callback to remove (if not provided, removes all)
   */
  off<K extends EventName>(
    eventName: K,
    callback?: EventCallback<BeatBaxEvents[K]>
  ): void {
    if (!callback) {
      // Remove all listeners for this event
      this.listeners.delete(eventName);
      return;
    }

    const callbacks = this.listeners.get(eventName);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(eventName);
      }
    }
  }

  /**
   * Clear all event listeners
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get count of listeners for an event
   * @param eventName The event name
   * @returns Number of listeners
   */
  listenerCount(eventName: EventName): number {
    return this.listeners.get(eventName)?.size ?? 0;
  }

  /**
   * Get all event names with listeners
   * @returns Array of event names
   */
  eventNames(): EventName[] {
    return Array.from(this.listeners.keys());
  }
}

/**
 * Global event bus instance
 */
export const eventBus = new EventBus();
