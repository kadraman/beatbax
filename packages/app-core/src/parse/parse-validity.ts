/** Payload shape for {@link BeatBaxEvents['parse:success']} (subset). */
export type ParseSuccessPayload = { valid?: boolean; ephemeral?: boolean };

/** True when parse:success came from ephemeral playback (arrangement slice, etc.). */
export function isEphemeralParseSuccess(payload: ParseSuccessPayload): boolean {
  return payload.ephemeral === true;
}

/** True when a parse resolved without validation errors (default when `valid` omitted). */
export function isParseSuccessValid(payload: ParseSuccessPayload): boolean {
  return payload.valid !== false;
}
