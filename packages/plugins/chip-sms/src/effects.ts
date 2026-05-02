/**
 * SMS PSG Advanced Effects
 * 
 * Implements software-based effects for the SMS PSG:
 * - Vibrato (periodic pitch modulation)
 * - Portamento (sliding between notes)
 * - Tremolo (periodic volume modulation)
 * 
 * These effects are implemented in software since the SMS PSG hardware
 * only supports basic tone/noise generation without built-in effects.
 */

import type { SMSToneBackend } from './tone.js';
import type { SMSNoiseBackend } from './noise.js';

/**
 * Vibrato effect parameters
 */
export interface VibratoEffect {
  depth: number;  // Depth in semitones (0-12)
  rate: number;   // Rate in Hz (0.1-20)
  phase: number;  // Current phase (0-1)
}

/**
 * Portamento effect parameters
 */
export interface PortamentoEffect {
  targetFreq: number;  // Target frequency in Hz
  slideRate: number;    // Slide rate in semitones per second
  currentFreq: number;  // Current frequency in Hz
}

/**
 * Tremolo effect parameters
 */
export interface TremoloEffect {
  depth: number;  // Depth in dB (0-12)
  rate: number;   // Rate in Hz (0.1-20)
  phase: number;  // Current phase (0-1)
}

/**
 * Apply vibrato effect to a tone channel
 */
export function applyVibrato(
  channel: SMSToneBackend,
  effect: VibratoEffect,
  deltaTime: number
): void {
  // Update phase based on rate and deltaTime
  effect.phase += effect.rate * deltaTime;
  if (effect.phase > 1) effect.phase -= 1;
  
  // Calculate vibrato modulation (sine wave)
  const modulation = Math.sin(2 * Math.PI * effect.phase) * effect.depth;
  
  // Get current frequency and apply vibrato
  const currentFreq = channel.getFrequency() || 440;
  const modulatedFreq = currentFreq * Math.pow(2, modulation / 12);
  
  // Update channel frequency
  channel.setFrequency(modulatedFreq);
}

/**
 * Apply portamento effect to a tone channel
 */
export function applyPortamento(
  channel: SMSToneBackend,
  effect: PortamentoEffect,
  deltaTime: number
): void {
  const currentFreq = effect.currentFreq;
  const targetFreq = effect.targetFreq;
  
  if (Math.abs(currentFreq - targetFreq) < 0.1) {
    // Reached target
    effect.currentFreq = targetFreq;
    channel.setFrequency(targetFreq);
    return;
  }
  
  // Calculate frequency difference in semitones
  const currentSemitones = 12 * Math.log2(currentFreq / 440);
  const targetSemitones = 12 * Math.log2(targetFreq / 440);
  const semitoneDiff = targetSemitones - currentSemitones;
  
  // Calculate slide amount based on rate
  const slideAmount = effect.slideRate * deltaTime;
  const direction = semitoneDiff > 0 ? 1 : -1;
  const actualSlide = Math.min(Math.abs(semitoneDiff), slideAmount) * direction;
  
  // Update current frequency
  const newSemitones = currentSemitones + actualSlide;
  effect.currentFreq = 440 * Math.pow(2, newSemitones / 12);
  
  // Update channel frequency
  channel.setFrequency(effect.currentFreq);
}

/**
 * Apply tremolo effect to a tone channel
 */
export function applyTremolo(
  channel: SMSToneBackend,
  effect: TremoloEffect,
  deltaTime: number
): void {
  // Update phase based on rate and deltaTime
  effect.phase += effect.rate * deltaTime;
  if (effect.phase > 1) effect.phase -= 1;
  
  // Calculate tremolo modulation (sine wave)
  const modulation = Math.sin(2 * Math.PI * effect.phase) * effect.depth;
  
  // Get current attenuation and apply tremolo
  const currentAttenuation = channel.getAttenuation();
  const modulatedAttenuation = Math.max(0, Math.min(15, currentAttenuation + modulation));
  
  // Update channel attenuation
  channel.setAttenuation(modulatedAttenuation);
}

/**
 * Apply vibrato effect to a noise channel
 */
export function applyNoiseVibrato(
  channel: SMSNoiseBackend,
  effect: VibratoEffect,
  deltaTime: number
): void {
  // Vibrato doesn't make sense for noise channels since they don't have pitch
  // But we can implement a similar effect by modulating the noise rate
  effect.phase += effect.rate * deltaTime;
  if (effect.phase > 1) effect.phase -= 1;
  
  const modulation = Math.sin(2 * Math.PI * effect.phase) * (effect.depth / 12); // Scale down
  
  // Get current noise rate
  const currentRate = channel.getNoiseRate();
  let modulatedRate;
  
  if (typeof currentRate === 'number') {
    modulatedRate = Math.max(0, Math.min(3, Math.round(currentRate + modulation)));
  } else {
    // If it's 'tone3', we can't modulate it meaningfully
    modulatedRate = 2; // Default to medium rate
  }
  
  // Update noise rate
  channel.setNoiseRate(modulatedRate);
} 
