/**
 * Unit tests for AST validation logic
 * Tests the validateAST function with various edge cases
 */

describe('AST Validation', () => {
  /**
   * Simplified validation function extracted from main-phase1.ts
   * This would ideally be exported from a dedicated validation module
   */
  function validateAST(ast: any, source: string): any[] {
    const warnings: any[] = [];
    const lines = source.split('\n');
    const validTransforms = new Set([
      'oct', 'inst', 'rev', 'slow', 'fast', 'transpose', 'arp'
    ]);

    // Validate channels reference existing sequences or patterns
    for (const ch of ast.channels || []) {
      if (!ch) continue;

      // Extract and validate sequence references
      const extractSeqNames = (channel: any): string[] => {
        const names: string[] = [];
        if (!channel || !channel.pat) return names;
        if (Array.isArray(channel.pat)) return [];

        const rawTokens: string[] | undefined = (channel as any).seqSpecTokens;
        if (rawTokens && rawTokens.length > 0) {
          const joined = rawTokens.join(' ');
          for (const group of joined.split(',')) {
            const g = group.trim();
            if (!g) continue;
            const itemRef = g.match(/^(.+?)\s*\*\s*(\d+)$/) ? g.match(/^(.+?)\s*\*\s*(\d+)$/)![1].trim() : g;
            const base = itemRef.split(':')[0];
            if (base) names.push(base);

            if (itemRef.indexOf(':') >= 0) {
              const transformParts = itemRef.split(':').slice(1);
              for (const transform of transformParts) {
                const transformName = transform.trim().split('(')[0];
                if (transformName && !validTransforms.has(transformName)) {
                  warnings.push({
                    component: 'transforms',
                    message: `Unknown transform '${transformName}' on '${g}'. Valid transforms: oct(±N), inst(name), rev, slow, fast, transpose(±N), arp(...).`,
                    loc: ch.loc
                  });
                }
              }
            }
          }
          return names.filter(Boolean);
        }

        const spec = String(channel.pat).trim();
        for (const group of spec.split(',')) {
          const g = group.trim();
          if (!g) continue;
          const itemRef = g.match(/^(.+?)\s*\*\s*(\d+)$/) ? g.match(/^(.+?)\s*\*\s*(\d+)$/)![1].trim() : g;
          const base = itemRef.split(':')[0];
          if (base) names.push(base);
        }
        return names.filter(Boolean);
      };

      const seqNames = extractSeqNames(ch);
      for (const seqName of seqNames) {
        if (!ast.seqs || !ast.seqs[seqName]) {
          if (ast.pats && ast.pats[seqName]) {
            warnings.push({
              component: 'validation',
              message: `Channel ${ch.id} references '${seqName}' as a sequence, but it's a pattern. Create a sequence first: 'seq myseq = ${seqName}'.`,
              loc: ch.loc
            });
          } else if (!ast.pats || !ast.pats[seqName]) {
            warnings.push({
              component: 'validation',
              message: `Channel ${ch.id} references unknown sequence or pattern '${seqName}'`,
              loc: ch.loc
            });
          }
        }
      }
    }

    // Validate sequences reference existing patterns
    for (const seqName in ast.seqs || {}) {
      const seq = ast.seqs[seqName];
      if (!seq) continue;

      let patternRefs: string[] = [];
      
      if (Array.isArray(seq)) {
        patternRefs = seq.filter(item => typeof item === 'string');
      }

      let seqLineIndex = -1;
      let seqLine = '';
      if (lines.length > 0) {
        seqLineIndex = lines.findIndex(line => {
          const trimmed = line.trim();
          return trimmed.startsWith(`seq ${seqName}`) || trimmed.startsWith(`seq ${seqName} `);
        });
        if (seqLineIndex !== -1) {
          seqLine = lines[seqLineIndex];
        }
      }

      let searchStartPos = 0;

      for (const ref of patternRefs) {
        if (!ref || typeof ref !== 'string') continue;
        
        const withoutRepeat = ref.split('*')[0].trim();
        const patternName = withoutRepeat.split(':')[0].trim();
        
        if (patternName && patternName !== '') {
          if (!ast.pats || !ast.pats[patternName]) {
            if (!ast.seqs || !ast.seqs[patternName]) {
              let loc = undefined;
              if (seqLineIndex !== -1 && seqLine) {
                const patternIndex = seqLine.indexOf(patternName, searchStartPos);
                if (patternIndex !== -1) {
                  searchStartPos = patternIndex + patternName.length;
                  loc = {
                    start: {
                      line: seqLineIndex + 1,
                      column: patternIndex + 1
                    },
                    end: {
                      line: seqLineIndex + 1,
                      column: patternIndex + patternName.length + 1
                    }
                  };
                }
              }
              warnings.push({
                component: 'validation',
                message: `Sequence '${seqName}' references unknown pattern '${patternName}'`,
                loc
              });
            }
          }
        }
      }
    }

    // Validate patterns - check instrument token references
    if (ast.patternEvents) {
      for (const [patName, events] of Object.entries(ast.patternEvents)) {
        if (!Array.isArray(events)) continue;
        
        for (const event of events as any[]) {
          if (event.kind === 'token' && event.value) {
            if (!ast.insts?.[event.value]) {
              if (!ast.pats?.[event.value]) {
                warnings.push({
                  component: 'validation',
                  message: `Pattern '${patName}' references undefined instrument '${event.value}'`,
                  loc: event.loc
                });
              }
            }
          } else if (event.kind === 'inline-inst' && event.name) {
            if (!ast.insts?.[event.name]) {
              warnings.push({
                component: 'validation',
                message: `Pattern '${patName}' references undefined instrument '${event.name}' in inst() modifier`,
                loc: event.loc
              });
            }
          } else if (event.kind === 'temp-inst' && event.name) {
            if (!ast.insts?.[event.name]) {
              warnings.push({
                component: 'validation',
                message: `Pattern '${patName}' references undefined instrument '${event.name}' in inst(,N) temporary override`,
                loc: event.loc
              });
            }
          }
        }
      }
    }

    return warnings;
  }

  describe('Valid AST Cases', () => {
    it('should pass validation with no warnings for valid AST', () => {
      const ast = {
        insts: {
          lead: { type: 'pulse1' },
          bass: { type: 'pulse2' }
        },
        pats: {
          melody: ['C4', 'E4', 'G4']
        },
        seqs: {
          main: ['melody']
        },
        channels: [
          { id: 1, pat: 'main', inst: 'lead' }
        ],
        patternEvents: {
          melody: [
            { kind: 'note', value: 'C4' },
            { kind: 'note', value: 'E4' },
            { kind: 'note', value: 'G4' }
          ]
        }
      };

      const source = `
inst lead type=pulse1
inst bass type=pulse2
pat melody = C4 E4 G4
seq main = melody
channel 1 => inst lead seq main
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toEqual([]);
    });

    it('should pass validation when patterns use defined instruments', () => {
      const ast = {
        insts: {
          snare: { type: 'noise' },
          kick: { type: 'noise' }
        },
        pats: {
          drums: []
        },
        patternEvents: {
          drums: [
            { kind: 'token', value: 'snare', loc: { start: { line: 3, column: 15 } } },
            { kind: 'rest', value: '.' },
            { kind: 'token', value: 'kick', loc: { start: { line: 3, column: 21 } } }
          ]
        }
      };

      const source = `
inst snare type=noise
inst kick type=noise
pat drums = snare . kick
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toEqual([]);
    });

    it('should pass validation with inline inst() modifier using defined instruments', () => {
      const ast = {
        insts: {
          lead: { type: 'pulse1' },
          bass: { type: 'pulse2' }
        },
        pats: {
          melody: []
        },
        patternEvents: {
          melody: [
            { kind: 'note', value: 'C4' },
            { kind: 'inline-inst', name: 'lead', loc: { start: { line: 3, column: 20 } } },
            { kind: 'note', value: 'E4' }
          ]
        }
      };

      const source = `
inst lead type=pulse1
inst bass type=pulse2
pat melody = C4 inst(lead) E4
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toEqual([]);
    });

    it('should pass validation with temp inst(name,N) override', () => {
      const ast = {
        insts: {
          lead: { type: 'pulse1' }
        },
        pats: {
          melody: []
        },
        patternEvents: {
          melody: [
            { kind: 'note', value: 'C4' },
            { kind: 'temp-inst', name: 'lead', duration: 2, loc: { start: { line: 2, column: 20 } } },
            { kind: 'note', value: 'E4' }
          ]
        }
      };

      const source = `
inst lead type=pulse1
pat melody = C4 inst(lead,2) E4
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toEqual([]);
    });
  });

  describe('Undefined Instrument References', () => {
    it('should warn about undefined instrument in pattern token', () => {
      const ast = {
        insts: {
          lead: { type: 'pulse1' }
        },
        pats: {
          drums: []
        },
        patternEvents: {
          drums: [
            { kind: 'token', value: 'snare', loc: { start: { line: 2, column: 15 } } },
            { kind: 'rest', value: '.' }
          ]
        }
      };

      const source = `
inst lead type=pulse1
pat drums = snare .
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        component: 'validation',
        message: expect.stringContaining("references undefined instrument 'snare'")
      });
    });

    it('should warn about undefined instrument in inline inst() modifier', () => {
      const ast = {
        insts: {
          lead: { type: 'pulse1' }
        },
        pats: {
          melody: []
        },
        patternEvents: {
          melody: [
            { kind: 'note', value: 'C4' },
            { kind: 'inline-inst', name: 'bass', loc: { start: { line: 2, column: 20 } } },
            { kind: 'note', value: 'E4' }
          ]
        }
      };

      const source = `
inst lead type=pulse1
pat melody = C4 inst(bass) E4
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        component: 'validation',
        message: expect.stringContaining("references undefined instrument 'bass' in inst() modifier")
      });
    });

    it('should warn about undefined instrument in temp inst(name,N) override', () => {
      const ast = {
        insts: {
          lead: { type: 'pulse1' }
        },
        pats: {
          melody: []
        },
        patternEvents: {
          melody: [
            { kind: 'note', value: 'C4' },
            { kind: 'temp-inst', name: 'organ', duration: 3, loc: { start: { line: 2, column: 20 } } },
            { kind: 'note', value: 'G4' }
          ]
        }
      };

      const source = `
inst lead type=pulse1
pat melody = C4 inst(organ,3) G4
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        component: 'validation',
        message: expect.stringContaining("references undefined instrument 'organ' in inst(,N) temporary override")
      });
    });

    it('should warn about multiple undefined instruments in a pattern', () => {
      const ast = {
        insts: {},
        pats: {
          drums: []
        },
        patternEvents: {
          drums: [
            { kind: 'token', value: 'kick', loc: { start: { line: 1, column: 15 } } },
            { kind: 'token', value: 'snare', loc: { start: { line: 1, column: 20 } } },
            { kind: 'token', value: 'hihat', loc: { start: { line: 1, column: 26 } } }
          ]
        }
      };

      const source = 'pat drums = kick snare hihat';

      const warnings = validateAST(ast, source);
      expect(warnings).toHaveLength(3);
      expect(warnings[0].message).toContain("'kick'");
      expect(warnings[1].message).toContain("'snare'");
      expect(warnings[2].message).toContain("'hihat'");
    });
  });

  describe('Undefined Pattern References', () => {
    it('should warn about undefined pattern in sequence', () => {
      const ast = {
        pats: {
          intro: []
        },
        seqs: {
          main: ['intro', 'verse', 'chorus']
        }
      };

      const source = `
pat intro = C4 E4 G4
seq main = intro verse chorus
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toMatchObject({
        component: 'validation',
        message: expect.stringContaining("references unknown pattern 'verse'")
      });
      expect(warnings[1]).toMatchObject({
        component: 'validation',
        message: expect.stringContaining("references unknown pattern 'chorus'")
      });
    });

    it('should warn about pattern with transforms in sequence', () => {
      const ast = {
        pats: {
          melody: []
        },
        seqs: {
          main: ['melody:oct(+1)', 'unknown:rev']
        }
      };

      const source = `
pat melody = C4 E4
seq main = melody:oct(+1) unknown:rev
      `.trim();

      const warnings = validateAST(ast, source);
      // Should warn about 'unknown' pattern, not 'melody' (which exists)
      const unknownPatternWarnings = warnings.filter(w => 
        w.message.includes("unknown pattern 'unknown'")
      );
      expect(unknownPatternWarnings.length).toBeGreaterThan(0);
    });

    it('should not warn when sequence references another sequence', () => {
      const ast = {
        pats: {
          melody: []
        },
        seqs: {
          partA: ['melody'],
          main: ['partA']
        }
      };

      const source = `
pat melody = C4 E4
seq partA = melody
seq main = partA
      `.trim();

      const warnings = validateAST(ast, source);
      // No warnings because referencing a sequence from another sequence is valid
      expect(warnings).toEqual([]);
    });
  });

  describe('Undefined Sequence References', () => {
    it('should warn about undefined sequence in channel', () => {
      const ast = {
        insts: {
          lead: { type: 'pulse1' }
        },
        pats: {},
        seqs: {},
        channels: [
          { id: 1, pat: 'main', inst: 'lead', loc: { start: { line: 2, column: 1 } } }
        ]
      };

      const source = `
inst lead type=pulse1
channel 1 => inst lead seq main
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        component: 'validation',
        message: expect.stringContaining("references unknown sequence or pattern 'main'")
      });
    });

    it('should warn when channel references pattern as sequence', () => {
      const ast = {
        insts: {
          lead: { type: 'pulse1' }
        },
        pats: {
          melody: []
        },
        seqs: {},
        channels: [
          { id: 1, pat: 'melody', inst: 'lead', loc: { start: { line: 3, column: 1 } } }
        ]
      };

      const source = `
inst lead type=pulse1
pat melody = C4 E4 G4
channel 1 => inst lead seq melody
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        component: 'validation',
        message: expect.stringContaining("references 'melody' as a sequence, but it's a pattern")
      });
      expect(warnings[0].message).toContain("Create a sequence first");
    });

    it('should handle multiple sequence references in channel', () => {
      const ast = {
        insts: {
          lead: { type: 'pulse1' }
        },
        seqs: {
          intro: []
        },
        channels: [
          { 
            id: 1, 
            pat: 'intro verse chorus', 
            inst: 'lead',
            seqSpecTokens: ['intro', ',', 'verse', ',', 'chorus'],
            loc: { start: { line: 2, column: 1 } }
          }
        ]
      };

      const source = `
inst lead type=pulse1
channel 1 => inst lead seq intro,verse,chorus
      `.trim();

      const warnings = validateAST(ast, source);
      // Should have warnings about verse and chorus
      expect(warnings.length).toBeGreaterThan(0);
      const hasVerseWarning = warnings.some(w => w.message.includes("'verse'"));
      const hasChorusWarning = warnings.some(w => w.message.includes("'chorus'"));
      expect(hasVerseWarning || hasChorusWarning).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty AST gracefully', () => {
      const ast = {};
      const source = '';

      const warnings = validateAST(ast, source);
      expect(warnings).toEqual([]);
    });

    it('should handle AST with null/undefined fields', () => {
      const ast = {
        insts: null,
        pats: undefined,
        seqs: null,
        channels: null,
        patternEvents: undefined
      };
      const source = '';

      const warnings = validateAST(ast, source);
      expect(warnings).toEqual([]);
    });

    it('should handle pattern events with missing fields', () => {
      const ast = {
        insts: {},
        pats: {
          test: []
        },
        patternEvents: {
          test: [
            { kind: 'token' }, // Missing value
            { kind: 'inline-inst' }, // Missing name
            { kind: 'temp-inst' }, // Missing name
            { value: 'something' } // Missing kind
          ]
        }
      };

      const source = 'pat test = ???';

      const warnings = validateAST(ast, source);
      // Should not crash, warnings depend on validation logic
      expect(Array.isArray(warnings)).toBe(true);
    });

    it('should handle sequence with non-string pattern references', () => {
      const ast = {
        pats: {},
        seqs: {
          main: [null, undefined, 123, true, ['nested']]
        }
      };

      const source = 'seq main = ???';

      const warnings = validateAST(ast, source);
      // Should filter out non-string references and not crash
      expect(Array.isArray(warnings)).toBe(true);
    });

    it('should handle pattern names with special characters', () => {
      const ast = {
        pats: {
          'melody-1': []
        },
        seqs: {
          main: ['melody-1', 'melody-2']
        }
      };

      const source = `
pat melody-1 = C4 E4
seq main = melody-1 melody-2
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain("'melody-2'");
    });

    it('should handle patterns with repeat syntax (pattern*N)', () => {
      const ast = {
        pats: {
          riff: []
        },
        seqs: {
          main: ['riff*4', 'bridge*2']
        }
      };

      const source = `
pat riff = C4 E4
seq main = riff*4 bridge*2
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain("'bridge'");
      // Should not warn about 'riff' which exists
    });

    it('should warn about unknown transforms in sequence modifiers', () => {
      const ast = {
        pats: {
          melody: []
        },
        seqs: {},
        channels: [
          { 
            id: 1, 
            pat: 'melody:invalidTransform',
            seqSpecTokens: ['melody:invalidTransform'],
            inst: 'lead',
            loc: { start: { line: 2, column: 1 } }
          }
        ]
      };

      const source = `
pat melody = C4 E4
channel 1 => seq melody:invalidTransform
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings.length).toBeGreaterThan(0);
      const transformWarning = warnings.find(w => 
        w.component === 'transforms' && w.message.includes('invalidTransform')
      );
      expect(transformWarning).toBeDefined();
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle patterns, sequences, and channels together', () => {
      const ast = {
        insts: {
          lead: { type: 'pulse1' },
          bass: { type: 'pulse2' }
        },
        pats: {
          melody: [],
          bassline: []
        },
        seqs: {
          verse: ['melody', 'melody'],
          chorus: ['melody', 'bridge'] // bridge doesn't exist
        },
        channels: [
          { id: 1, pat: 'verse', inst: 'lead' },
          { id: 2, pat: 'outro', inst: 'bass', loc: { start: { line: 7, column: 1 } } } // outro doesn't exist
        ],
        patternEvents: {
          melody: [
            { kind: 'token', value: 'synth', loc: { start: { line: 2, column: 15 } } } // synth doesn't exist
          ],
          bassline: [
            { kind: 'note', value: 'C2' }
          ]
        }
      };

      const source = `
inst lead type=pulse1
pat melody = synth C4 E4
pat bassline = C2
seq verse = melody melody
seq chorus = melody bridge
channel 1 => inst lead seq verse
channel 2 => inst bass seq outro
      `.trim();

      const warnings = validateAST(ast, source);
      
      // Should have warnings for:
      // 1. Undefined instrument 'synth' in pattern
      // 2. Undefined pattern 'bridge' in sequence
      // 3. Undefined sequence 'outro' in channel
      expect(warnings.length).toBeGreaterThanOrEqual(3);
      
      expect(warnings.some(w => w.message.includes("'synth'"))).toBe(true);
      expect(warnings.some(w => w.message.includes("'bridge'"))).toBe(true);
      expect(warnings.some(w => w.message.includes("'outro'"))).toBe(true);
    });

    it('should provide location information when available', () => {
      const ast = {
        insts: {},
        pats: {
          drums: []
        },
        patternEvents: {
          drums: [
            { 
              kind: 'token', 
              value: 'kick', 
              loc: { 
                start: { line: 2, column: 15 },
                end: { line: 2, column: 19 }
              } 
            }
          ]
        }
      };

      const source = `
inst snare type=noise
pat drums = kick snare
      `.trim();

      const warnings = validateAST(ast, source);
      expect(warnings).toHaveLength(1);
      expect(warnings[0].loc).toBeDefined();
      expect(warnings[0].loc.start.line).toBe(2);
      expect(warnings[0].loc.start.column).toBe(15);
    });
  });
});
