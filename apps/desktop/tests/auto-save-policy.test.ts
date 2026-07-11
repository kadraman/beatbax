import { parseStatus, validationErrors } from '@beatbax/app-core/stores/editor.store';
import { canAutoSaveToDisk } from '../src/renderer/src/lib/auto-save-policy';

describe('canAutoSaveToDisk', () => {
  afterEach(() => {
    validationErrors.set([]);
    parseStatus.set('idle');
  });

  it('allows auto-save after a clean successful parse', () => {
    parseStatus.set('success');
    expect(canAutoSaveToDisk()).toBe(true);
  });

  it('blocks auto-save while parsing', () => {
    parseStatus.set('parsing');
    expect(canAutoSaveToDisk()).toBe(false);
  });

  it('blocks auto-save after a parse failure', () => {
    parseStatus.set('error');
    expect(canAutoSaveToDisk()).toBe(false);
  });

  it('blocks auto-save when validation errors are present', () => {
    parseStatus.set('success');
    validationErrors.set([{ component: 'parser', message: 'Unexpected token' }]);
    expect(canAutoSaveToDisk()).toBe(false);
  });

  it('allows auto-save from parse:success payload even while parseStatus is still parsing', () => {
    parseStatus.set('parsing');
    expect(canAutoSaveToDisk({ valid: true })).toBe(true);
  });

  it('blocks auto-save when parse:success payload reports invalid', () => {
    parseStatus.set('success');
    expect(canAutoSaveToDisk({ valid: false })).toBe(false);
  });
});
