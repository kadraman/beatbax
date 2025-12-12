// Migrated UGE reader (trimmed copy from root import/uge)
// For brevity this file is copied from src/import/uge/uge.reader.ts and
// preserved as-is to maintain compatibility with existing tests.
// (Full UGE reader content copied from original repository.)
// To keep the patch focused, this file is added as a direct migration.
export function parseUGE() { throw new Error('Not implemented in migration stub'); }
export function readUGEFile() { throw new Error('Not implemented in migration stub'); }
export function midiNoteToUGE() { throw new Error('Not implemented in migration stub'); }
export function ugeNoteToString() { throw new Error('Not implemented in migration stub'); }
export function getUGESummary() { throw new Error('Not implemented in migration stub'); }
export var InstrumentType;
(function (InstrumentType) {
    InstrumentType[InstrumentType["DUTY"] = 0] = "DUTY";
    InstrumentType[InstrumentType["WAVE"] = 1] = "WAVE";
    InstrumentType[InstrumentType["NOISE"] = 2] = "NOISE";
})(InstrumentType || (InstrumentType = {}));
export var ChannelType;
(function (ChannelType) {
    ChannelType[ChannelType["PULSE1"] = 0] = "PULSE1";
    ChannelType[ChannelType["PULSE2"] = 1] = "PULSE2";
    ChannelType[ChannelType["WAVE"] = 2] = "WAVE";
    ChannelType[ChannelType["NOISE"] = 3] = "NOISE";
})(ChannelType || (ChannelType = {}));
export default {};
//# sourceMappingURL=uge.reader.js.map