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

  test('keeps unrelated diagnostics', () => {
    const warnings = [{ message: "Pattern 'mel': unknown token 'foo'." }];
    expect(omitIssuesForImportedInstruments(warnings, { adv_harm: {} })).toEqual(warnings);
  });
});
