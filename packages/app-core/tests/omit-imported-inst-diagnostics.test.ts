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

  test('keeps unrelated diagnostics', () => {
    const warnings = [{ message: "Pattern 'mel': unknown token 'foo'." }];
    expect(omitIssuesForImportedInstruments(warnings, { adv_harm: {} })).toEqual(warnings);
  });
});
