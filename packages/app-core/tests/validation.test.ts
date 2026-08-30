import { describe, expect, it } from '@jest/globals';
import {
  countValidationWarningBadge,
  isValidationProblemsPanelMessage,
  validationIssuePanelType,
} from '../src/types/validation';

describe('validation panel helpers', () => {
  it('maps info-level validation issues to info panel messages', () => {
    const issue = { component: 'arrangement', message: 'Phased layout detected.', level: 'info' as const };
    expect(validationIssuePanelType(issue)).toBe('info');
    expect(countValidationWarningBadge([issue])).toBe(0);
    expect(isValidationProblemsPanelMessage('info', 'validation')).toBe(true);
  });

  it('counts warning-level issues for the badge but not info hints', () => {
    const warning = { component: 'plugin', message: 'Missing env', level: 'warning' as const };
    const info = { component: 'arrangement', message: 'Monolithic layout detected.', level: 'info' as const };
    expect(countValidationWarningBadge([warning, info])).toBe(1);
  });

  it('treats issues without level as warnings', () => {
    const issue = { component: 'import-resolver', message: 'Unresolved import' };
    expect(validationIssuePanelType(issue)).toBe('warning');
    expect(countValidationWarningBadge([issue])).toBe(1);
  });
});
