
# -*- coding: utf-8 -*-
"""
UGE Parser (verbose) – reads hUGETracker .uge files (v5/v6), prints all details.

Usage:
  python uge_parser_verbose.py path/to/song.uge

Spec reference: https://superdisk.github.io/hUGETracker/hUGETracker/uge-format.html

It prints:
- Header (version, song name/artist/comment)
- All 15 Duty, 15 Wave, 15 Noise instruments (including per-row data)
- Wavetable data (16 × 32 nibbles)
- Song patterns (indices + 64 rows per pattern)
- Song orders (4 channels)
- Routines (16 strings)

Notes:
- All integers are little-endian.
- Shortstring = 1 byte length + 255-byte area (read only length bytes).
- For v>=6, extra fields (e.g., subpattern_enabled, pattern unused u32, timer tempo) are present.
"""

import sys
import struct
from dataclasses import dataclass
from typing import List, Optional, BinaryIO, Tuple

# -------------------- Safe read helpers --------------------

def read_exact(f: BinaryIO, n: int, ctx: str) -> bytes:
    pos = f.tell()
    b = f.read(n)
    if len(b) != n:
        raise EOFError(f"Needed {n} bytes for {ctx} at offset {pos}, got {len(b)}")
    return b

def read_u8(f: BinaryIO, ctx: str = "u8") -> int:
    return struct.unpack('<B', read_exact(f, 1, ctx))[0]

def read_u32(f: BinaryIO, ctx: str = "u32") -> int:
    return struct.unpack('<I', read_exact(f, 4, ctx))[0]

def read_i8(f: BinaryIO, ctx: str = "i8") -> int:
    return struct.unpack('<b', read_exact(f, 1, ctx))[0]

def read_bool_u8(f: BinaryIO, ctx: str = "bool(u8)") -> bool:
    return read_u8(f, ctx) != 0

def read_shortstring(f: BinaryIO, ctx: str = "shortstring") -> str:
    L = read_u8(f, ctx + ".length")
    raw = read_exact(f, 255, ctx + ".payload[255]")
    return raw[:L].decode('utf-8', errors='replace')

# string: u32 character count, then that many bytes (0x00 may appear; we strip trailing nulls)

def read_string(f: BinaryIO, ctx: str = "string") -> str:
    n_chars = read_u32(f, ctx + ".len")
    data = read_exact(f, n_chars, ctx + ".data")
    return data.rstrip(b" ").decode('utf-8', errors='replace')

# -------------------- Data classes --------------------

@dataclass
class InstrumentRow:
    note: int          # 0..72; 90 means unused
    jump: int          # 0 if empty
    effect_code: int
    effect_param: int

@dataclass
class Instrument:
    type: int          # 0 = Duty, 1 = Wave, 2 = Noise
    name: str
    length: int
    length_enabled: bool
    # Duty specifics
    initial_volume: Optional[int] = None
    volume_sweep_dir: Optional[int] = None    # 0 inc, 1 dec
    volume_sweep_change: Optional[int] = None
    freq_sweep_time: Optional[int] = None
    sweep_enabled: Optional[int] = None       # 1 enabled, 0 disabled
    freq_sweep_shift: Optional[int] = None
    duty_cycle: Optional[int] = None
    # Wave specifics
    volume: Optional[int] = None
    wave_index: Optional[int] = None
    # Noise specifics
    noise_mode: Optional[int] = None          # v<6: 0=15-bit, 1=7-bit
    # Common (v>=6)
    subpattern_enabled: Optional[bool] = None
    rows: Optional[List[InstrumentRow]] = None

@dataclass
class PatternRow:
    note: int
    instrument_val: int
    effect_code: int
    effect_param: int

@dataclass
class Pattern:
    index: int
    rows: List[PatternRow]

@dataclass
class Orders:
    duty1: List[int]
    duty2: List[int]
    wave: List[int]
    noise: List[int]

@dataclass
class UgeSong:
    version: int
    name: str
    artist: str
    comment: str
    duty_instruments: List[Instrument]
    wave_instruments: List[Instrument]
    noise_instruments: List[Instrument]
    wavetable_nibbles: List[List[int]]  # 16 waves × 32 nibbles
    initial_tpr: int
    timer_tempo_enabled: Optional[bool]
    timer_tempo_divider: Optional[int]
    patterns: List[Pattern]
    orders: Orders
    routines: List[str]

# -------------------- Parsing functions --------------------

def parse_instrument_rows(f: BinaryIO, version: int, ctx: str) -> List[InstrumentRow]:
    rows: List[InstrumentRow] = []
    for r in range(64):
        note = read_u32(f, f"{ctx}.row[{r}].note")
        _unused = read_u32(f, f"{ctx}.row[{r}].unused")
        jump = read_u32(f, f"{ctx}.row[{r}].jump")
        effect_code = read_u32(f, f"{ctx}.row[{r}].effect_code")
        effect_param = read_u8(f, f"{ctx}.row[{r}].effect_param")
        rows.append(InstrumentRow(note=note, jump=jump, effect_code=effect_code, effect_param=effect_param))
    if 4 <= version < 6:
        for i in range(6):
            _ = read_i8(f, f"{ctx}.post_rows_unused[{i}]")
    return rows

# Duty instrument per spec

def parse_duty_instrument(f: BinaryIO, version: int, idx: int) -> Instrument:
    base_off = f.tell()
    # Peek a few bytes for diagnostics so we can print helpful hex context
    peek = read_exact(f, 8, f"duty[{idx}].peek")
    # rewind to original position so regular readers advance as before
    f.seek(base_off)
    inst_type = read_u32(f, f"duty[{idx}].type")
    if inst_type != 0:
        # Attempt small resync: sometimes a single stray byte shifts fields.
        found = False
        for shift in range(1,5):
            try:
                f.seek(base_off + shift)
                cand = read_u32(f, f"duty[{idx}].type.peek_shift{shift}")
            except EOFError:
                break
            if cand == 0:
                print(f"WARNING: resyncing duty[{idx}] by {shift} byte(s) (was {inst_type}) at offset {base_off} -> {base_off+shift}")
                # Seek to the corrected start and continue parsing from there
                f.seek(base_off + shift)
                inst_type = cand
                found = True
                break
        if not found:
            # Show the 8-byte context we peeked (hex) to help debug misalignment
            hex_ctx = ' '.join(f"{b:02X}" for b in peek)
            raise ValueError(f"Unexpected duty instrument type {inst_type} at offset {base_off}; expected 0. Bytes@{base_off}: {hex_ctx}")

    name = read_shortstring(f, f"duty[{idx}].name")
    length = read_u32(f, f"duty[{idx}].length")
    length_enabled = read_bool_u8(f, f"duty[{idx}].length_enabled")

    initial_volume = read_u8(f, f"duty[{idx}].initial_volume")
    volume_sweep_dir = read_u32(f, f"duty[{idx}].volume_sweep_dir")
    volume_sweep_change = read_u8(f, f"duty[{idx}].volume_sweep_change")
    freq_sweep_time = read_u32(f, f"duty[{idx}].freq_sweep_time")
    sweep_enabled = read_u32(f, f"duty[{idx}].sweep_enabled")
    freq_sweep_shift = read_u32(f, f"duty[{idx}].freq_sweep_shift")
    duty_cycle = read_u8(f, f"duty[{idx}].duty_cycle")

    print(f"INST {idx}: {name} | sweep_time={freq_sweep_time} | sweep_dir={sweep_enabled} | sweep_shift={freq_sweep_shift}")

    # Two unused u32s
    _ = read_u32(f, f"duty[{idx}].unused_a")
    _ = read_u32(f, f"duty[{idx}].unused_b")
    if version < 6:
        _ = read_u32(f, f"duty[{idx}].unused_vlt6_c")
        _ = read_u32(f, f"duty[{idx}].unused_vlt6_d")
        _ = read_u32(f, f"duty[{idx}].unused_vlt6_e")
        subpattern_enabled = None  # older versions do not use subpattern_enabled
        # older versions include the rows block
        rows = parse_instrument_rows(f, version, ctx=f"duty[{idx}]")
    else:
        subpattern_enabled = read_bool_u8(f, f"duty[{idx}].subpattern_enabled")
        # In v6, subpattern rows are present only if subpattern_enabled is true.
        if subpattern_enabled:
            rows = parse_instrument_rows(f, version, ctx=f"duty[{idx}]")
        else:
            rows = None

    return Instrument(
        type=inst_type, name=name, length=length, length_enabled=length_enabled,
        initial_volume=initial_volume, volume_sweep_dir=volume_sweep_dir,
        volume_sweep_change=volume_sweep_change, freq_sweep_time=freq_sweep_time,
        sweep_enabled=sweep_enabled, freq_sweep_shift=freq_sweep_shift,
        duty_cycle=duty_cycle, subpattern_enabled=subpattern_enabled, rows=rows
    )

# Wave instrument per spec

def parse_wave_instrument(f: BinaryIO, version: int, idx: int) -> Instrument:
    base_off = f.tell()
    # Peek for diagnostics and possible small resync
    peek = read_exact(f, 8, f"wave[{idx}].peek")
    f.seek(base_off)
    inst_type = read_u32(f, f"wave[{idx}].type")
    if inst_type != 1:
        found = False
        for shift in range(1,5):
            try:
                f.seek(base_off + shift)
                cand = read_u32(f, f"wave[{idx}].type.peek_shift{shift}")
            except EOFError:
                break
            if cand == 1:
                print(f"WARNING: resyncing wave[{idx}] by {shift} byte(s) (was {inst_type}) at offset {base_off} -> {base_off+shift}")
                f.seek(base_off + shift)
                inst_type = cand
                found = True
                break
        if not found:
            hex_ctx = ' '.join(f"{b:02X}" for b in peek)
            raise ValueError(f"Unexpected wave instrument type {inst_type} at offset {base_off}; expected 1. Bytes@{base_off}: {hex_ctx}")

    name = read_shortstring(f, f"wave[{idx}].name")
    length = read_u32(f, f"wave[{idx}].length")
    length_enabled = read_bool_u8(f, f"wave[{idx}].length_enabled")

    _ = read_u8(f,  f"wave[{idx}].unused1_u8")
    _ = read_u32(f, f"wave[{idx}].unused2_u32")
    _ = read_u8(f,  f"wave[{idx}].unused3_u8")
    _ = read_u32(f, f"wave[{idx}].unused4_u32")
    _ = read_u32(f, f"wave[{idx}].unused5_u32")
    _ = read_u32(f, f"wave[{idx}].unused6_u32")
    _ = read_u8(f,  f"wave[{idx}].unused7_u8")

    volume = read_u32(f, f"wave[{idx}].volume")
    wave_index = read_u32(f, f"wave[{idx}].wave_index")

    if version < 6:
        _ = read_u32(f, f"wave[{idx}].unused_vlt6_a")
        _ = read_u32(f, f"wave[{idx}].unused_vlt6_b")
        _ = read_u32(f, f"wave[{idx}].unused_vlt6_c")
        subpattern_enabled = None  # older versions do not use subpattern_enabled
        # older versions include the rows block
        rows = parse_instrument_rows(f, version, ctx=f"wave[{idx}]")
    else:
        subpattern_enabled = read_bool_u8(f, f"wave[{idx}].subpattern_enabled")
        if subpattern_enabled:
            rows = parse_instrument_rows(f, version, ctx=f"wave[{idx}]")
        else:
            rows = None

    return Instrument(
        type=inst_type, name=name, length=length, length_enabled=length_enabled,
        volume=volume, wave_index=wave_index, subpattern_enabled=subpattern_enabled,
        rows=rows
    )

# Noise instrument per spec

def parse_noise_instrument(f: BinaryIO, version: int, idx: int) -> Instrument:
    base_off = f.tell()
    # Peek for diagnostics and possible small resync
    peek = read_exact(f, 8, f"noise[{idx}].peek")
    f.seek(base_off)
    inst_type = read_u32(f, f"noise[{idx}].type")
    if inst_type != 2:
        found = False
        for shift in range(1,5):
            try:
                f.seek(base_off + shift)
                cand = read_u32(f, f"noise[{idx}].type.peek_shift{shift}")
            except EOFError:
                break
            if cand == 2:
                print(f"WARNING: resyncing noise[{idx}] by {shift} byte(s) (was {inst_type}) at offset {base_off} -> {base_off+shift}")
                f.seek(base_off + shift)
                inst_type = cand
                found = True
                break
        if not found:
            hex_ctx = ' '.join(f"{b:02X}" for b in peek)
            raise ValueError(f"Unexpected noise instrument type {inst_type} at offset {base_off}; expected 2. Bytes@{base_off}: {hex_ctx}")

    name = read_shortstring(f, f"noise[{idx}].name")
    length = read_u32(f, f"noise[{idx}].length")
    length_enabled = read_bool_u8(f, f"noise[{idx}].length_enabled")

    initial_volume = read_u8(f, f"noise[{idx}].initial_volume")
    volume_sweep_dir = read_u32(f, f"noise[{idx}].volume_sweep_dir")
    volume_sweep_change = read_u8(f, f"noise[{idx}].volume_sweep_change")

    _ = read_u32(f, f"noise[{idx}].unused_a")
    _ = read_u32(f, f"noise[{idx}].unused_b")
    _ = read_u32(f, f"noise[{idx}].unused_c")
    _ = read_u8(f,  f"noise[{idx}].unused_d")
    _ = read_u32(f, f"noise[{idx}].unused_e")
    _ = read_u32(f, f"noise[{idx}].unused_f")

    if version < 6:
        _ = read_u32(f, f"noise[{idx}].unused_vlt6_a")
        noise_mode = read_u32(f, f"noise[{idx}].noise_mode")  # 0=15-bit, 1=7-bit
        _ = read_u32(f, f"noise[{idx}].unused_vlt6_b")
        subpattern_enabled = None
        # older versions include the rows block
        rows = parse_instrument_rows(f, version, ctx=f"noise[{idx}]")
    else:
        noise_mode = None
        subpattern_enabled = read_bool_u8(f, f"noise[{idx}].subpattern_enabled")
        if subpattern_enabled:
            rows = parse_instrument_rows(f, version, ctx=f"noise[{idx}]")
        else:
            rows = None

    return Instrument(
        type=inst_type, name=name, length=length, length_enabled=length_enabled,
        initial_volume=initial_volume, volume_sweep_dir=volume_sweep_dir,
        volume_sweep_change=volume_sweep_change, noise_mode=noise_mode,
        subpattern_enabled=subpattern_enabled, rows=rows
    )

# Wavetable: 16 waves × 32 nibbles (stored as bytes per spec)

def parse_wavetables(f: BinaryIO, version: int) -> List[List[int]]:
    waves: List[List[int]] = []
    for w in range(16):
        nibbles: List[int] = []
        for i in range(32):
            nibbles.append(read_u8(f, f"wavetable[{w}].nibble[{i}]"))
        waves.append(nibbles)
    if version < 3:
        _ = read_u8(f, "wavetable.off_by_one_filler")
    return waves

# Patterns per spec

def parse_patterns(f: BinaryIO, version: int) -> Tuple[int, Optional[bool], Optional[int], List[Pattern]]:
    initial_tpr = read_u32(f, "song.initial_ticks_per_row")
    timer_enabled = None
    timer_div = None
    if version >= 6:
        timer_enabled = read_bool_u8(f, "song.timer_tempo_enabled")
        timer_div = read_u32(f, "song.timer_tempo_divider")
    num_patterns = read_u32(f, "song.num_patterns")
    patterns: List[Pattern] = []
    for p in range(num_patterns):
        pat_idx = read_u32(f, f"pattern[{p}].index")
        rows: List[PatternRow] = []
        for r in range(64):
            note = read_u32(f, f"pattern[{p}].row[{r}].note")
            inst_val = read_u32(f, f"pattern[{p}].row[{r}].instrument_value")
            if version >= 6:
                _ = read_u32(f, f"pattern[{p}].row[{r}].unused_v6")
            effect_code = read_u32(f, f"pattern[{p}].row[{r}].effect_code")
            effect_param = read_u8(f, f"pattern[{p}].row[{r}].effect_param")
            rows.append(PatternRow(note=note, instrument_val=inst_val,
                                   effect_code=effect_code, effect_param=effect_param))
        patterns.append(Pattern(index=pat_idx, rows=rows))

    return initial_tpr, timer_enabled, timer_div, patterns

# Orders per spec

def parse_orders(f: BinaryIO) -> Orders:
    channels = []
    chan_names = ["Duty1", "Duty2", "Wave", "Noise"]
    for c in range(4):
        order_len_plus_one = read_u32(f, f"orders[{chan_names[c]}].length_plus_one")
        order_len = max(0, order_len_plus_one - 1)
        indices: List[int] = []
        for i in range(order_len):
            idx = read_u32(f, f"orders[{chan_names[c]}].index[{i}]")
            filler = read_u32(f, f"orders[{chan_names[c]}].filler[{i}]")
            indices.append(idx)
        channels.append(indices)
    return Orders(duty1=channels[0], duty2=channels[1], wave=channels[2], noise=channels[3])

# Routines per spec: 16 strings

def parse_routines(f: BinaryIO) -> List[str]:
    routines: List[str] = []
    for i in range(16):
        code = read_string(f, f"routine[{i}]")
        routines.append(code)
    return routines

# Full file parse

def read_uge(path: str) -> UgeSong:
    with open(path, 'rb') as f:
        version = read_u32(f, "header.version")
        # Validate supported versions early to avoid confusing parse errors.
        # This parser targets hUGETracker UGE v5/v6; older files (v4 or earlier)
        # use an incompatible layout and will lead to misaligned reads.
        if version < 5 or version > 6:
            raise ValueError(f"Unsupported UGE version {version}. This parser supports only v5 or v6 files.")
        name = read_shortstring(f, "header.song_name")
        artist = read_shortstring(f, "header.song_artist")
        comment = read_shortstring(f, "header.song_comment")

        # Diagnostic: print file offset before instrument blocks
        print(f"DEBUG: after header, file offset={f.tell()}")

        duty_insts = []
        for i in range(15):
            print(f"DEBUG: parsing duty[{i}] at offset={f.tell()}")
            duty_insts.append(parse_duty_instrument(f, version, idx=i))

        wave_insts = []
        for i in range(15):
            print(f"DEBUG: parsing wave[{i}] at offset={f.tell()}")
            wave_insts.append(parse_wave_instrument(f, version, idx=i))

        noise_insts = []
        for i in range(15):
            print(f"DEBUG: parsing noise[{i}] at offset={f.tell()}")
            noise_insts.append(parse_noise_instrument(f, version, idx=i))

        waves = parse_wavetables(f, version)
        initial_tpr, timer_enabled, timer_div, patterns = parse_patterns(f, version)
        orders = parse_orders(f)
        routines = parse_routines(f)

        return UgeSong(
            version=version, name=name, artist=artist, comment=comment,
            duty_instruments=duty_insts, wave_instruments=wave_insts,
            noise_instruments=noise_insts, wavetable_nibbles=waves,
            initial_tpr=initial_tpr, timer_tempo_enabled=timer_enabled,
            timer_tempo_divider=timer_div, patterns=patterns,
            orders=orders, routines=routines
        )

# -------------------- Pretty printer --------------------

class Printer:
    def __init__(self):
        self.indent = 0

    def p(self, msg: str):
        print("  " * self.indent + msg)

    def section(self, title: str):
        self.p(title)

    def push(self):
        self.indent += 1

    def pop(self):
        self.indent = max(0, self.indent - 1)


def dump_song(song: UgeSong):
    pr = Printer()

    pr.section(f"UGE version: {song.version}")
    pr.section(f"Title: {song.name}")
    pr.section(f"Artist: {song.artist}")
    pr.section(f"Comment: {song.comment}")

    # Instruments
    pr.section("Duty Instruments (15):")
    pr.push()
    for i, inst in enumerate(song.duty_instruments):
        pr.section(f"[{i}] name='{inst.name}', length={inst.length}, enabled={inst.length_enabled}")
        pr.push()
        pr.p(f"initial_volume={inst.initial_volume}, volume_sweep_dir={inst.volume_sweep_dir}, "
             f"volume_sweep_change={inst.volume_sweep_change}, freq_sweep_time={inst.freq_sweep_time},")
        pr.p(f"sweep_enabled={inst.sweep_enabled}, freq_sweep_shift={inst.freq_sweep_shift}, duty_cycle={inst.duty_cycle}")
        pr.p(f"subpattern_enabled={inst.subpattern_enabled}")
        pr.section("rows:")
        pr.push()
        for r, row in enumerate(inst.rows or []):
            pr.p(f"{r:02d}: note={row.note}, jump={row.jump}, effect={row.effect_code}, param={row.effect_param}")
        pr.pop()
        pr.pop()
    pr.pop()

    pr.section("Wave Instruments (15):")
    pr.push()
    for i, inst in enumerate(song.wave_instruments):
        pr.section(f"[{i}] name='{inst.name}', length={inst.length}, enabled={inst.length_enabled}")
        pr.push()
        pr.p(f"volume={inst.volume}, wave_index={inst.wave_index}, subpattern_enabled={inst.subpattern_enabled}")
        pr.section("rows:")
        pr.push()
        for r, row in enumerate(inst.rows or []):
            pr.p(f"{r:02d}: note={row.note}, jump={row.jump}, effect={row.effect_code}, param={row.effect_param}")
        pr.pop()
        pr.pop()
    pr.pop()

    pr.section("Noise Instruments (15):")
    pr.push()
    for i, inst in enumerate(song.noise_instruments):
        pr.section(f"[{i}] name='{inst.name}', length={inst.length}, enabled={inst.length_enabled}")
        pr.push()
        pr.p(f"initial_volume={inst.initial_volume}, volume_sweep_dir={inst.volume_sweep_dir}, "
             f"volume_sweep_change={inst.volume_sweep_change}, noise_mode={inst.noise_mode}, "
             f"subpattern_enabled={inst.subpattern_enabled}")
        pr.section("rows:")
        pr.push()
        for r, row in enumerate(inst.rows or []):
            pr.p(f"{r:02d}: note={row.note}, jump={row.jump}, effect={row.effect_code}, param={row.effect_param}")
        pr.pop()
        pr.pop()
    pr.pop()

    pr.section("Wavetables (16 waves × 32 nibbles):")
    pr.push()
    for w, nibbles in enumerate(song.wavetable_nibbles):
        preview = ' '.join(f"{n:02X}" for n in nibbles[:32])
        pr.p(f"Wave {w:02d}: {preview}")
    pr.pop()

    pr.section(f"Initial ticks per row: {song.initial_tpr}")
    pr.section(f"Timer tempo enabled: {song.timer_tempo_enabled}")
    pr.section(f"Timer tempo divider: {song.timer_tempo_divider}")
    pr.section(f"Patterns ({len(song.patterns)}):")
    pr.push()
    for p, pat in enumerate(song.patterns):
        pr.section(f"Pattern[{p}] index={pat.index}")
        pr.push()
        for r, row in enumerate(pat.rows):
            pr.p(f"{r:02d}: note={row.note}, inst={row.instrument_val}, effect={row.effect_code}, param={row.effect_param}")
        pr.pop()
    pr.pop()

    pr.section("Orders:")
    pr.push()
    pr.p("Duty1: " + ','.join(map(str, song.orders.duty1)))
    pr.p("Duty2: " + ','.join(map(str, song.orders.duty2)))
    pr.p("Wave:  " + ','.join(map(str, song.orders.wave)))
    pr.p("Noise: " + ','.join(map(str, song.orders.noise)))
    pr.pop()

    pr.section("Routines (16):")
    pr.push()
    for i, code in enumerate(song.routines):
        preview = (code[:120] + '…') if len(code) > 120 else code
        pr.p(f"[{i:02d}] {preview}")
    pr.pop()

# -------------------- CLI --------------------

def main(argv: List[str]):
    if len(argv) < 2:
        print("Usage: python uge_parser_verbose.py path/to/song.uge")
        sys.exit(1)
    path = argv[1]
    song = read_uge(path)
    dump_song(song)

if __name__ == '__main__':
    main(sys.argv)
