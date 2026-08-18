import { omitIssuesForImportedInstruments } from '../src/import/omit-imported-inst-diagnostics';

describe('omitIssuesForImportedInstruments', () => {
  test('drops channel instrument warnings once the import supplies the name', () => {
    const warnings = [
      { message: "Channel 2: instrument 'adv_harm' is not defined." },
      { message: "Channel 1: instrument 'adv_lead' is not defined." },
      { message: "Channel 3: instrument 'ghost' is not defined." },
    ];
    const kept = omitIssuesForImportedInstruments(warnings, {
      adv_harm: { type: 'pulse2' },
      adv_lead: { type: 'pulse1' },
    });
    expect(kept.map((w) => w.message)).toEqual([
      "Channel 3: instrument 'ghost' is not defined.",
    ]);
  });

  test('drops effect-not-defined warnings once the import supplies the name', () => {
    const warnings = [
      { message: "Pattern 'body_d': effect 'drift' is not defined and will be ignored — add an 'effect drift = ...' definition, or use a built-in inline effect such as <vib:3,5>." },
      { message: "Pattern 'x': effect 'ghost' is not defined and will be ignored — add an 'effect ghost = ...' definition, or use a built-in inline effect such as <vib:3,5>." },
    ];
    const kept = omitIssuesForImportedInstruments(
      warnings,
      { adv_lead: { type: 'pulse1' } },
      { drift: 'vib:3,4' },
    );
    expect(kept.map((w) => w.message)).toEqual([warnings[1].message]);
  });

  test('drops subpat-unresolved warnings once import bind fills subpatRows', () => {
    const warnings = [
      { message: "Instrument 'adv_lead_drift': subpat='melody_drift' is not defined." },
      { message: "Instrument 'adv_lead_drift': subpat='melody_drift' was not resolved (define `subpat melody_drift = …` first)" },
      { message: "Instrument 'adv_lead_drift': Instrument: subpat='melody_drift' was not resolved (missing subpat declaration?)." },
      { message: "Instrument 'ghost': subpat='missing_table' is not defined." },
    ];
    const kept = omitIssuesForImportedInstruments(warnings, {
      adv_lead_drift: {
        type: 'pulse1',
        subpat: 'melody_drift',
        subpatRows: [{ empty: true }],
      },
    });
    expect(kept.map((w) => w.message)).toEqual([warnings[3].message]);
  });

  test('keeps unrelated diagnostics', () => {
    const warnings = [{ message: "Pattern 'mel': unknown token 'foo'." }];
    expect(omitIssuesForImportedInstruments(warnings, { adv_harm: {} })).toEqual(warnings);
  });
});
