/** Payload shape for {@link BeatBaxEvents['parse:success']} (subset). */
export type ParseSuccessPayload = { valid?: boolean };

/** True when a parse resolved without validation errors (default when `valid` omitted). */
export function isParseSuccessValid(payload: ParseSuccessPayload): boolean {
  return payload.valid !== false;
}
