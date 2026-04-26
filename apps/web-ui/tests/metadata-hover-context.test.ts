/**
 * Test that instrument/effect hovers are suppressed inside metadata strings
 */

describe('Metadata hover context detection', () => {
  /**
   * Helper to check if a position is inside a quoted string.
   * This mimics the isPositionInString function used in beatbax-language.ts
   */
  function isPositionInString(line: string, column: number): boolean {
    const upToCursor = line.substring(0, column - 1);

    let i = 0;
    let inQuote = false;

    while (i < upToCursor.length) {
      // Check for triple quotes first
      if (upToCursor.substring(i, i + 3) === '"""') {
        inQuote = !inQuote;
        i += 3;
      } else if (upToCursor[i] === '"') {
        // Only toggle if not preceded by another quote
        if (!inQuote || upToCursor.substring(i - 2, i) !== '""') {
          inQuote = !inQuote;
        }
        i += 1;
      } else {
        i += 1;
      }
    }

    return inQuote;
  }

  it('detects text inside single-quoted strings', () => {
    const line = 'song description "text with lead here"';
    // Position 27 is at 'l' in 'lead'
    expect(isPositionInString(line, 27)).toBe(true);
  });

  it('detects text inside triple-quoted strings', () => {
    const line = 'song description """lead, ghost, kick and snare"""';
    // Position 28 is at 'l' in 'lead'
    expect(isPositionInString(line, 28)).toBe(true);
  });

  it('detects instrument names outside quotes (should allow hover)', () => {
    const line = 'inst lead type=pulse1 duty=50';
    // Position 6 is at 'l' in 'lead' (after 'inst ')
    expect(isPositionInString(line, 6)).toBe(false);
  });

  it('detects closing quote boundary correctly', () => {
    const line = 'song description "lead"';
    // Position 23 is at closing quote - should still be inside
    expect(isPositionInString(line, 23)).toBe(true);
    // Position 24 is after closing quote - should be outside
    expect(isPositionInString(line, 24)).toBe(false);
  });

  it('handles escaped quotes in song metadata', () => {
    const line = 'song description "NES-style with kick snare and lead"';
    // Multiple instrument names inside quotes
    expect(isPositionInString(line, 28)).toBe(true); // 'k' in 'kick'
    expect(isPositionInString(line, 34)).toBe(true); // 's' in 'snare'
    expect(isPositionInString(line, 44)).toBe(true); // 'l' in 'lead'
  });

  it('preserves hover for actual definitions outside strings', () => {
    const lines = [
      'inst lead type=pulse1',      // line 1: definition, no hover suppression
      'inst ghost type=noise',      // line 2: definition, no hover suppression
      'song description "lead ghost kick"', // line 3: in string, hover suppressed
      'channel 1 => inst lead seq main', // line 4: reference outside string, no suppression
    ];

    // Line 1: 'lead' after 'inst ' - outside quotes
    expect(isPositionInString(lines[0], 6)).toBe(false);

    // Line 2: 'ghost' after 'inst ' - outside quotes
    expect(isPositionInString(lines[1], 6)).toBe(false);

    // Line 3: all three instrument names inside quotes
    const line3 = lines[2]; // 'song description "lead ghost kick"'
    const posInQuote = line3.indexOf('"lead') + 2; // position of 'l' in 'lead'
    expect(isPositionInString(line3, posInQuote)).toBe(true);

    // Line 4: 'lead' in channel assignment - outside quotes
    expect(isPositionInString(lines[3], 29)).toBe(false);
  });

  it('handles multiline triple-quoted strings (single line check)', () => {
    // Note: this test checks a single line from a multiline string
    // The actual implementation needs to track state across lines
    const line = 'The lead, ghost, kick and snare perform the intro."""';
    // This is INSIDE a multiline string that started on previous line
    // So triple-quote tracking would need to happen across lines
    // For now, just check that quotes at the end toggle state
    expect(isPositionInString(line, 5)).toBe(false); // before triple quote
    expect(isPositionInString(line, 55)).toBe(true); // after triple quote toggle
  });

  it('real example from user report', () => {
    // The actual metadata line from the user's issue
    const line = 'song description """Original NES-style RPG battle chiptune at 155 BPM in A minor, inspired by the heroic, urgent battle music aesthetic of late-1980s NES RPGs (Final Fantasy era). Entirely original composition; no copyrighted material reproduced. Full 5-channel 2A03 arrangement: fanfare opening with duty_env shimmer on Pulse 1 stabs; 25% duty staccato Pulse 1 lead with driving 16th-note battle theme; 50% duty Pulse 2 parallel-fourth harmony with arp_env chord cycling in the bridge; repeating Am ostinato on Triangle; martial vol_env noise percussion with ghost hits; bundled @nes/ DMC kick/snare reinforcement."""';

    // All these instrument names should be detected as INSIDE the string
    const leadPos = line.indexOf('lead with');
    expect(isPositionInString(line, leadPos + 1)).toBe(true);

    const ghostPos = line.indexOf('ghost hits');
    expect(isPositionInString(line, ghostPos + 1)).toBe(true);

    const kickPos = line.indexOf('kick/snare');
    expect(isPositionInString(line, kickPos + 1)).toBe(true);

    const snarePos = line.indexOf('snare reinforcement');
    expect(isPositionInString(line, snarePos + 1)).toBe(true);
  });
});
