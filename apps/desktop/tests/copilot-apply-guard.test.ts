/** @jest-environment node */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  assessEditApplyGuard,
  buildIncompleteSongRepairPrompt,
  buildMissingBaxRepairPrompt,
  countSubstantiveLines,
  detectSongAnchors,
  extractSectionMarkers,
  mergeSectionMarkersFromCopilotTexts,
  tryMergeSectionMarkersIntoSong,
  tryMergeSnippetIntoSong,
} from '../src/renderer/src/lib/copilot-apply-guard';

const sampleSongPath = resolve(__dirname, '../../../songs/sample.bax');
const sampleSong = readFileSync(sampleSongPath, 'utf8');

describe('detectSongAnchors', () => {
  it('detects structure in sample.bax', () => {
    const anchors = detectSongAnchors(sampleSong);
    expect(anchors.hasChip).toBe(true);
    expect(anchors.hasPlay).toBe(true);
    expect(anchors.channelCount).toBe(4);
    expect(anchors.patternCount).toBeGreaterThanOrEqual(5);
    expect(anchors.instrumentCount).toBeGreaterThanOrEqual(4);
  });
});

describe('assessEditApplyGuard', () => {
  it('allows apply when previous editor is empty', () => {
    expect(assessEditApplyGuard('', 'chip gameboy\nplay auto')).toEqual({ ok: true });
  });

  it('allows a full-song replacement of similar size', () => {
    const tweaked = sampleSong.replace(
      'pat drums_pat      = (snare . . .) (snare . . .) (snare . . .) (snare . hihat .)',
      'pat drums_pat      = (snare hihat . .) (snare hihat . .) (snare hihat . .) (snare hihat hihat .)',
    );
    expect(assessEditApplyGuard(sampleSong, tweaked)).toEqual({ ok: true });
  });

  it('blocks a single-pattern snippet that would wipe sample.bax', () => {
    const snippet = 'pat drums_pat = C5:4 D5:2 C5:1 C5:1 E5:4 F5:2 E5:1 E5:1';
    const result = assessEditApplyGuard(sampleSong, snippet);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/fragment|snippet|full/i);
  });

  it('blocks responses missing play and channels', () => {
    const result = assessEditApplyGuard(sampleSong, 'pat drums_pat = (snare hihat . .) * 4');
    expect(result.ok).toBe(false);
  });

  it('allows compact edits on a short scratch buffer', () => {
    const scratch = 'chip gameboy\nbpm 120\npat p = C5:4\nchannel 1 => inst leadA pat p\nplay auto';
    expect(assessEditApplyGuard(scratch, 'chip gameboy\npat p = D5:4\nchannel 1 => inst leadA pat p\nplay auto')).toEqual({ ok: true });
  });
});

describe('tryMergeSnippetIntoSong', () => {
  it('merges a single pat line into sample.bax', () => {
    const snippet = 'pat drums_pat = (snare hihat . .) (snare hihat . .) (snare hihat . .) (snare hihat hihat .)';
    const merged = tryMergeSnippetIntoSong(sampleSong, snippet);
    expect(merged).not.toBeNull();
    expect(merged).toContain(snippet.trim());
    expect(merged).toContain('play auto repeat');
    expect(merged).toContain('channel 1 =>');
    expect(assessEditApplyGuard(sampleSong, merged!)).toEqual({ ok: true });
  });

  it('returns null for multi-line snippets', () => {
    const snippet = 'pat drums_pat = (snare . . .)\npat bass_pat = C3';
    expect(tryMergeSnippetIntoSong(sampleSong, snippet)).toBeNull();
  });

  it('merges a single inst line into sample.bax', () => {
    const snippet = 'inst leadA type=pulse2 duty=50 env=12,down';
    const merged = tryMergeSnippetIntoSong(sampleSong, snippet);
    expect(merged).not.toBeNull();
    expect(merged).toContain(snippet.trim());
    expect(merged).not.toContain('type=pulse1');
  });
});

describe('tryMergeSectionMarkersIntoSong', () => {
  it('inserts section markers before the first seq definition', () => {
    const song = [
      'chip nes',
      'bpm 120',
      'pat p = C5:4',
      'seq main = p p',
      'channel 1 => inst lead pat p',
      'play auto',
    ].join('\n');
    const snippet = [
      '# --- Section 1: Fanfare ---',
      '# --- Section 2: Theme A ---',
    ].join('\n');
    const merged = tryMergeSectionMarkersIntoSong(song, snippet);
    expect(merged).toContain('# --- Section 1: Fanfare ---');
    expect(merged).toContain('# --- Section 2: Theme A ---');
    expect(merged?.indexOf('Section 1')).toBeLessThan(merged?.indexOf('seq main') ?? 0);
  });

  it('extracts markers from fenced blocks in assistant text', () => {
    const text = [
      'Add markers:',
      '```bax',
      '# --- Section 1: Intro ---',
      '```',
    ].join('\n');
    expect(extractSectionMarkers(text)).toEqual(['# --- Section 1: Intro ---']);
  });

  it('places one marker before each phased seq group', () => {
    const song = [
      'chip gameboy',
      'seq lead_intro = rest_bar rest_bar',
      'seq bass_intro = bass_a bass_b',
      '',
      'seq lead_main = lead_a lead_b',
      'seq bass_main = bass_c bass_d',
      'channel 1 => inst lead seq lead_intro lead_main',
      'play auto',
    ].join('\n');
    const markers = [
      '# --- Section 1: Intro ---',
      '# --- Section 2: Main ---',
    ];
    const merged = tryMergeSectionMarkersIntoSong(song, markers);
    expect(merged?.indexOf('Section 1')).toBeLessThan(merged?.indexOf('seq lead_intro') ?? 0);
    expect(merged?.indexOf('Section 2')).toBeLessThan(merged?.indexOf('seq lead_main') ?? 0);
    expect(merged?.indexOf('Section 1')).toBeLessThan(merged?.indexOf('Section 2') ?? 0);
  });

  it('reports already applied markers without calling the model', () => {
    const song = [
      'chip gameboy',
      '# --- Section 1: Intro ---',
      'seq main = p p',
      'channel 1 => inst lead pat p',
      'play auto',
    ].join('\n');
    const result = mergeSectionMarkersFromCopilotTexts(song, '# --- Section 1: Intro ---');
    expect(result).toEqual({ status: 'already' });
  });

  it('merges markers from snippet and assistant context together', () => {
    const song = [
      'chip gameboy',
      'seq main = p p',
      'channel 1 => inst lead pat p',
      'play auto',
    ].join('\n');
    const result = mergeSectionMarkersFromCopilotTexts(
      song,
      '# --- Section 1: Intro ---',
      '# --- Section 2: Main ---',
    );
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.song).toContain('# --- Section 1: Intro ---');
    expect(result.song).toContain('# --- Section 2: Main ---');
  });
});

describe('buildMissingBaxRepairPrompt', () => {
  it('asks for a fenced full song', () => {
    const prompt = buildMissingBaxRepairPrompt('add markers', sampleSong);
    expect(prompt).toContain('```bax fenced code block');
    expect(prompt).toContain('add markers');
    expect(prompt).toContain('play auto repeat');
  });
});

describe('buildIncompleteSongRepairPrompt', () => {
  it('includes the user request and full song', () => {
    const prompt = buildIncompleteSongRepairPrompt(
      'add hihats',
      sampleSong,
      'pat drums_pat = x',
      'missing play',
    );
    expect(prompt).toContain('add hihats');
    expect(prompt).toContain('play auto repeat');
    expect(prompt).toContain('missing play');
  });
});

describe('countSubstantiveLines', () => {
  it('ignores blank and // comment lines', () => {
    expect(countSubstantiveLines('a\n\n// skip\nb')).toBe(2);
  });
});
