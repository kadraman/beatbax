const fs = require("fs");
const {
  VGM,
  VGMWriteDataCommand,
  VGMEndCommand,
  parseVGMCommand
} = require("vgm-parser");

function toArrayBuffer(b) {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}
const song = process.argv[2];

const buf = fs.readFileSync(song);

/* Do not pass buf.buffer directly. It only works when buf.byteOffset == 0. */
/* fs.readFileSync often returns Buffer with byteOffset != 0. */
const vgm = VGM.parse(toArrayBuffer(buf));
console.log(vgm);

/* Iterative access for VGM commands */
let index = 0;
const data = new Uint8Array(vgm.data);
while (true) {
  try {
    const cmd = parseVGMCommand(data, index);
    console.log(cmd);
    index += cmd.size;
    if (cmd instanceof VGMEndCommand) break;
  } catch (e) {
    console.error(e);
    break;
  }
}

/* Access VGM commands as a list */
const stream = vgm.getDataStream();
for (const cmd of stream.commands) {
  if (cmd instanceof VGMWriteDataCommand) {
    console.log(cmd);
  }
}
