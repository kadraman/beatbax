#!/usr/bin/env bash
# Audition NES DMC samples one by one via BeatBax CLI.
# After each play, choose: keep / delete / replace (or skip).
# At the end, prints a paste-ready summary for chat.
#
# Run from repo root:
#   bash scripts/audition-nes-dmc.sh
#
# Requires: npm run cli:build  (or an existing packages/cli/dist/cli.js)

set -euo pipefail
cd "$(dirname "$0")/.."

STAMP="$(date '+%Y-%m-%d %H:%M')"
RESULTS=() # entries: name|rate|decision|note|comment

play_dmc() {
  local name="$1"
  local rate="${2:-15}"
  local note="${3:-}"
  local path="samples/dmc/${name}.dmc"

  if [[ ! -f "$path" ]]; then
    echo "SKIP missing $path"
    RESULTS+=("${name}|${rate}|missing|${note}|file not found")
    return 0
  fi

  echo ""
  echo "============================================================"
  echo "=== @nes/${name}  (rate ${rate})  ${path} ==="
  [[ -n "$note" ]] && echo "    ${note}"

  npm run cli -- play "$path" --rate "$rate" --play-gain 1.5 --headless

  local decision="" comment=""
  while [[ -z "$decision" ]]; do
    echo ""
    echo "Verdict for @nes/${name} :"
    echo "  [K] keep     keep as-is in the bundled kit"
    echo "  [D] delete   drop from bundled kit (and song refs later)"
    echo "  [R] replace  keep the slot, swap for a better CC0 source"
    echo "  [S] skip     no decision this pass"
    echo "  [P] replay   play again"
    echo "  [Q] quit     stop audition; print summary so far"
    read -r -p "Choice: " raw
    raw="$(echo "${raw:-}" | tr '[:upper:]' '[:lower:]' | xargs)"
    case "$raw" in
      k|keep)
        decision=keep
        read -r -p "Optional note (Enter to skip): " comment || true
        ;;
      d|delete|del)
        decision=delete
        read -r -p "Optional note (why / replace with what?): " comment || true
        ;;
      r|replace|rep)
        decision=replace
        read -r -p "Replace with what? (source idea / URL / description): " comment || true
        [[ -z "${comment:-}" ]] && comment='(no note)'
        ;;
      s|skip)
        decision=skip
        read -r -p "Optional note (Enter to skip): " comment || true
        ;;
      p|play|replay)
        npm run cli -- play "$path" --rate "$rate" --play-gain 1.5 --headless
        ;;
      q|quit)
        RESULTS+=("${name}|${rate}|quit-before|${note}|stopped before verdict")
        write_summary
        exit 0
        ;;
      *)
        echo "Unknown choice '$raw' — use K / D / R / S / P / Q"
        ;;
    esac
  done

  RESULTS+=("${name}|${rate}|${decision}|${note}|${comment:-}")
  echo "Recorded: ${name} -> ${decision}"
}

write_summary() {
  local out="samples/dmc/audition-results-$(date '+%Y%m%d-%H%M%S').txt"
  local keep_n=0 delete_n=0 replace_n=0 skip_n=0
  local keep_lines=() delete_lines=() replace_lines=() skip_lines=() other_lines=()

  for entry in "${RESULTS[@]}"; do
    IFS='|' read -r name rate decision note comment <<<"$entry"
    local extra=""
    [[ -n "$comment" ]] && extra=" — ${comment}"
    local line="  - ${name} (rate ${rate})${extra}"
    case "$decision" in
      keep) keep_lines+=("$line"); keep_n=$((keep_n + 1)) ;;
      delete) delete_lines+=("$line"); delete_n=$((delete_n + 1)) ;;
      replace) replace_lines+=("$line"); replace_n=$((replace_n + 1)) ;;
      skip) skip_lines+=("$line"); skip_n=$((skip_n + 1)) ;;
      *) other_lines+=("  - ${name}: ${decision} ${comment}") ;;
    esac
  done

  {
    echo '```'
    echo "NES DMC audition results (${STAMP})"
    echo ""
    echo "KEEP (${keep_n}):"
    if (( keep_n == 0 )); then echo '  (none)'; else printf '%s\n' "${keep_lines[@]}"; fi
    echo ""
    echo "DELETE (${delete_n}):"
    if (( delete_n == 0 )); then echo '  (none)'; else printf '%s\n' "${delete_lines[@]}"; fi
    echo ""
    echo "REPLACE (${replace_n}):"
    if (( replace_n == 0 )); then echo '  (none)'; else printf '%s\n' "${replace_lines[@]}"; fi
    echo ""
    echo "SKIP (${skip_n}):"
    if (( skip_n == 0 )); then echo '  (none)'; else printf '%s\n' "${skip_lines[@]}"; fi
    if ((${#other_lines[@]} > 0)); then
      echo ""
      echo "OTHER:"
      printf '%s\n' "${other_lines[@]}"
    fi
    echo '```'
  } | tee "$out"

  echo ""
  echo "Also saved to: $out"
}

# ── Classic kit ──────────────────────────────────────────────────────────────
play_dmc kick 15 'classic thin kick'
play_dmc snare 15 'classic snare'
play_dmc clap 15
play_dmc bongo 15
play_dmc muted_bongo 15
play_dmc high_tom 15
play_dmc middle_tom 15
play_dmc low_tom 15

# ── Feature 109 percussion ───────────────────────────────────────────────────
play_dmc kick_punch 15 'phoenix Bass Drum__002 (louder)'
play_dmc kick_body 15 'tight sine-drop body'
play_dmc snare_tight 15 'Spring Spring lo-fi snare'
play_dmc snare_fat 15 'Spring Spring crunchy snare'
play_dmc hat_closed 15 'phoenix Hi-hat__002'
play_dmc hat_open 15 'Virtuosity acoustic open hat'
play_dmc crash 15 'tinny crash synth (kept)'
play_dmc crash_cym 15 '808 CY5050 (= cymbal_808)'
play_dmc rim 15 'rimshot crack + shell'
play_dmc shaker 15 'CC0 Deep Shaker'
play_dmc cowbell 15 'original cowbell synth'

# ── Full 808 kit (Michael Fischer WAV / CC0) ─────────────────────────────────
play_dmc kick_808 15 'BD0025 thump + BD0000 click (short)'
play_dmc snare_808 15 'SD5050 (loudnorm)'
play_dmc hat_808 15 'CH (loudnorm)'
play_dmc hat_open_808 15 'OH50'
play_dmc clap_808 15 'CP'
play_dmc cymbal_808 15 'CY5050'
play_dmc rim_808 15 'RS'
play_dmc cowbell_808 15 'CB'
play_dmc maracas_808 15 'MA'
play_dmc tom_low_808 15 'LT50'
play_dmc tom_mid_808 15 'MT50'
play_dmc tom_high_808 15 'HT50'

# ── 909 (kept) ───────────────────────────────────────────────────────────────
play_dmc kick_909 15 'GRD JDXi 909 kick'
play_dmc snare_909 15 'ani_music 909 snare+clap (CC0)'
play_dmc hat_909 15 'GRD JDXi 909 closed hat'
play_dmc hat_open_909 15 'GRD JDXi 909 open hat'

# ── Bass / orch / voice ──────────────────────────────────────────────────────
play_dmc bass_saw_c0 15 'lowest (C0)'
play_dmc bass_saw_d0 15
play_dmc bass_saw_e0 15
play_dmc bass_saw_g0 15
play_dmc bass_saw_a0 15
play_dmc bass_saw_c1 15 'highest (C1)'
play_dmc orch_hit 15 'SFXMint downward orch hit'
play_dmc orch_hit_up 15 'orch_hit pitch-shifted up'
play_dmc voice_correct 15 'Kenney Male "correct"'
play_dmc voice_go 15 'Kenney Male "go"'
play_dmc voice_set 15 'Kenney Male "set"'
play_dmc voice_hurry_up 15 'Kenney Male "hurry up"'
play_dmc voice_level_up 15 'Kenney Male "level up"'
play_dmc voice_go_go_go 15 'Kenney Male "go go go"'
play_dmc voice_you_win 15 'Kenney Male "you win"'
play_dmc voice_ready 12 'Kenney Male "ready" — encode@15 play@12'

write_summary
