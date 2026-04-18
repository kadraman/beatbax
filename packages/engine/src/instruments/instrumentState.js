export function getInstrumentByName(insts, name) {
    if (!name)
        return undefined;
    return insts[name] || undefined;
}
export function applyInstrumentToEvent(insts, event) {
    if (!event || !event.instrument)
        return event;
    const instName = event.instrument;
    const inst = getInstrumentByName(insts, instName);
    // attach resolved instrument object under `instProps` for downstream consumers
    // Accept alternate property `envelope` (long form) and map it to `env`
    // so downstream renderers that expect `env` continue to work.
    if (inst && typeof inst === 'object') {
        const p = { ...inst };
        if (p.envelope !== undefined && p.env === undefined) {
            p.env = p.envelope;
        }
        return { ...event, instProps: p, instrument: instName };
    }
    return { ...event, instProps: inst, instrument: instName };
}
export default { getInstrumentByName, applyInstrumentToEvent };
//# sourceMappingURL=instrumentState.js.map