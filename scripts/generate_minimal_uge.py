#!/usr/bin/env python3
"""
Generate a minimal valid UGE v6 file for testing.
Creates a file with 15 duty, 15 wave, 15 noise instruments (all minimal/empty),
followed by minimal wavetable, patterns, orders, and routines.
"""
import struct

def write_u8(f, val):
    f.write(struct.pack('<B', val))

def write_u32(f, val):
    f.write(struct.pack('<I', val))

def write_bool(f, val):
    write_u8(f, 1 if val else 0)

def write_shortstring(f, s):
    """Write shortstring: 1 byte length + 255 bytes (padded with zeros)"""
    b = s.encode('utf-8')[:255]
    write_u8(f, len(b))
    f.write(b + b'\x00' * (255 - len(b)))

def write_string(f, s):
    """Write string: u32 length + bytes (Pascal AnsiString format - length does NOT include null terminator)"""
    b = s.encode('utf-8')
    write_u32(f, len(b))
    if len(b) > 0:
        f.write(b)

def write_minimal_duty_instrument(f, idx):
    write_u32(f, 0)  # type = duty
    write_shortstring(f, f"duty{idx}")
    write_u32(f, 0)  # length
    write_bool(f, False)  # length_enabled
    write_u8(f, 15)  # initial_volume
    write_u32(f, 0)  # volume_sweep_dir
    write_u8(f, 0)  # volume_sweep_change
    write_u32(f, 0)  # freq_sweep_time
    write_u32(f, 0)  # sweep_enabled
    write_u32(f, 0)  # freq_sweep_shift
    write_u8(f, 2)  # duty_cycle (50%)
    write_u32(f, 0)  # unused_a
    write_u32(f, 0)  # unused_b
    write_u32(f, 0)  # counter_step (TStepWidth)
    # v6: subpattern_enabled + subpattern (ALWAYS 64 rows in TInstrumentV3)
    write_bool(f, False)
    # Write 64 subpattern rows (part of TInstrumentV3 structure)
    for row in range(64):
        write_u32(f, 90)  # note
        write_u32(f, 0)   # instrument  
        write_u32(f, 0x00005A00)  # volume
        write_u32(f, 0)   # effect_code
        write_u8(f, 0)    # effect_param

def write_minimal_wave_instrument(f, idx):
    write_u32(f, 1)  # type = wave
    write_shortstring(f, f"wave{idx}")
    write_u32(f, 0)  # length
    write_bool(f, False)  # length_enabled
    write_u8(f, 0)  # unused1
    write_u32(f, 0)  # unused2
    write_u8(f, 0)  # unused3
    write_u32(f, 0)  # unused4
    write_u32(f, 0)  # unused5
    write_u32(f, 0)  # unused6
    write_u8(f, 0)  # unused7
    write_u32(f, 3)  # volume
    write_u32(f, 0)  # wave_index
    write_u32(f, 0)  # counter_step (TStepWidth)
    # v6: subpattern_enabled + subpattern (ALWAYS 64 rows in TInstrumentV3)
    write_bool(f, False)
    # Write 64 subpattern rows (part of TInstrumentV3 structure)
    for row in range(64):
        write_u32(f, 90)  # note
        write_u32(f, 0)   # instrument
        write_u32(f, 0x00005A00)  # volume
        write_u32(f, 0)   # effect_code
        write_u8(f, 0)    # effect_param

def write_minimal_noise_instrument(f, idx):
    write_u32(f, 2)  # type = noise
    write_shortstring(f, f"noise{idx}")
    write_u32(f, 0)  # length
    write_bool(f, False)  # length_enabled
    write_u8(f, 15)  # initial_volume
    write_u32(f, 1)  # volume_sweep_dir
    write_u8(f, 0)  # volume_sweep_change
    write_u32(f, 0)  # unused_a
    write_u32(f, 0)  # unused_b
    write_u32(f, 0)  # unused_c
    write_u8(f, 0)  # unused_d
    write_u32(f, 0)  # unused_e
    write_u32(f, 0)  # unused_f
    write_u32(f, 0)  # counter_step (TStepWidth)
    # v6: subpattern_enabled + subpattern (ALWAYS 64 rows in TInstrumentV3)
    write_bool(f, False)
    # Write 64 subpattern rows (part of TInstrumentV3 structure)
    for row in range(64):
        write_u32(f, 90)  # note
        write_u32(f, 0)   # instrument
        write_u32(f, 0x00005A00)  # volume
        write_u32(f, 0)   # effect_code
        write_u8(f, 0)    # effect_param

def generate_minimal_uge_v6(output_path):
    with open(output_path, 'wb') as f:
        # Header
        write_u32(f, 6)  # version = 6
        write_shortstring(f, "Test Song")
        write_shortstring(f, "Test Artist")
        write_shortstring(f, "Generated minimal UGE v6")

        # 15 duty instruments
        for i in range(15):
            write_minimal_duty_instrument(f, i)

        # 15 wave instruments
        for i in range(15):
            write_minimal_wave_instrument(f, i)

        # 15 noise instruments
        for i in range(15):
            write_minimal_noise_instrument(f, i)

        # Wavetable: 16 waves × 32 nibbles
        for w in range(16):
            for n in range(32):
                # Simple sine-ish wave pattern
                write_u8(f, (n % 16))

        # Patterns section
        write_u32(f, 7)  # initial_ticks_per_row (7 is common default, ~120 BPM)
        write_bool(f, False)  # timer_tempo_enabled
        write_u32(f, 0)  # timer_tempo_divider
        write_u32(f, 1)  # num_patterns (1 empty pattern)

        # Pattern 0
        write_u32(f, 0)  # pattern index
        for row in range(64):
            write_u32(f, 90)  # note = 90 (unused)
            write_u32(f, 0)  # instrument_value
            write_u32(f, 0x00005A00)  # volume = 0x00005A00 (23040) - "no volume change" marker
            write_u32(f, 0)  # effect_code
            write_u8(f, 0)  # effect_param

        # Orders: 4 channels, each with 1 pattern
        # Pascal code: Read n, allocate n elements, read n integers
        # For 1 order: write length=1, then write 1 integer (the pattern index)
        for ch in range(4):
            write_u32(f, 1)  # order_length = 1 (one pattern in the order)
            write_u32(f, 0)  # index[0] = pattern 0

        # Routines: 16 empty strings
        for i in range(16):
            write_string(f, "")

    print(f"✓ Generated minimal valid UGE v6 file: {output_path}")
    print(f"  File size: {open(output_path, 'rb').seek(0, 2)} bytes" if open(output_path, 'rb') else "")

if __name__ == '__main__':
    generate_minimal_uge_v6('valid_v6_test.uge')
    print("\nYou can now test with: python uge_parser.py valid_v6_test.uge")
