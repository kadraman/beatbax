import { parseStatus, validationErrors } from '@beatbax/app-core/stores/editor.store';
import { isParseSuccessValid, type ParseSuccessPayload } from '@beatbax/app-core/parse/parse-validity';

/** True when the current song has no blocking parse/validation errors. */
export function canAutoSaveToDisk(parsePayload?: ParseSuccessPayload): boolean {
  if (validationErrors.get().length > 0) return false;
  if (parsePayload !== undefined && !isParseSuccessValid(parsePayload)) return false;
  if (parsePayload !== undefined && isParseSuccessValid(parsePayload)) return true;
  const status = parseStatus.get();
  if (status === 'error' || status === 'parsing') return false;
  return status === 'success';
}
