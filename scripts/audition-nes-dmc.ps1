# Audition NES DMC samples one by one via BeatBax CLI.
# After each play, choose: keep / delete / replace (or skip).
# At the end, prints a paste-ready summary for chat.
#
# Run from repo root:
#   powershell -File scripts/audition-nes-dmc.ps1
#
# Requires: npm run cli:build  (or an existing packages/cli/dist/cli.js)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$results = [System.Collections.Generic.List[object]]::new()
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'

function Play-Dmc([string]$Name, [int]$Rate = 15, [string]$Note = '') {
  $path = "samples/dmc/$Name.dmc"
  if (-not (Test-Path $path)) {
    Write-Host "SKIP missing $path" -ForegroundColor Yellow
    $results.Add([pscustomobject]@{
      Name = $Name; Rate = $Rate; Decision = 'missing'; Note = 'file not found'; Comment = ''
    }) | Out-Null
    return
  }

  Write-Host ""
  Write-Host ("=" * 60) -ForegroundColor DarkGray
  Write-Host "=== @nes/$Name  (rate $Rate)  $path ===" -ForegroundColor Cyan
  if ($Note) { Write-Host "    $Note" -ForegroundColor DarkGray }

  npm run cli -- play $path --rate $Rate --play-gain 1.5 --headless

  $decision = $null
  $comment = ''
  while ($null -eq $decision) {
    Write-Host ""
    Write-Host "Verdict for @nes/$Name :" -ForegroundColor Yellow
    Write-Host "  [K] keep     keep as-is in the bundled kit"
    Write-Host "  [D] delete   drop from bundled kit (and song refs later)"
    Write-Host "  [R] replace  keep the slot, swap for a better CC0 source"
    Write-Host "  [S] skip     no decision this pass"
    Write-Host "  [P] replay   play again"
    Write-Host "  [Q] quit     stop audition; print summary so far"
    $raw = Read-Host "Choice"
    if ($null -eq $raw) { $raw = '' }
    switch -Regex ($raw.Trim().ToLowerInvariant()) {
      '^(k|keep)$' {
        $decision = 'keep'
        $comment = (Read-Host "Optional note (Enter to skip)").Trim()
      }
      '^(d|delete|del)$' {
        $decision = 'delete'
        $comment = (Read-Host "Optional note (why / replace with what?)").Trim()
      }
      '^(r|replace|rep)$' {
        $decision = 'replace'
        $comment = (Read-Host "Replace with what? (source idea / URL / description)").Trim()
        if (-not $comment) { $comment = '(no note)' }
      }
      '^(s|skip)$' {
        $decision = 'skip'
        $comment = (Read-Host "Optional note (Enter to skip)").Trim()
      }
      '^(p|play|replay)$' {
        npm run cli -- play $path --rate $Rate --play-gain 1.5 --headless
      }
      '^(q|quit)$' {
        $results.Add([pscustomobject]@{
          Name = $Name; Rate = $Rate; Decision = 'quit-before'; Note = $Note; Comment = 'stopped before verdict'
        }) | Out-Null
        Write-Summary
        exit 0
      }
      default {
        Write-Host "Unknown choice '$raw' — use K / D / R / S / P / Q" -ForegroundColor Red
      }
    }
  }

  $results.Add([pscustomobject]@{
    Name = $Name; Rate = $Rate; Decision = $decision; Note = $Note; Comment = $comment
  }) | Out-Null
  Write-Host "Recorded: $Name -> $decision" -ForegroundColor Green
}

function Write-Summary {
  Write-Host ""
  Write-Host ("=" * 60) -ForegroundColor Cyan
  Write-Host "NES DMC audition summary — paste this back into chat" -ForegroundColor Cyan
  Write-Host ("=" * 60) -ForegroundColor Cyan
  Write-Host ""

  $lines = [System.Collections.Generic.List[string]]::new()
  [void]$lines.Add('```')
  [void]$lines.Add("NES DMC audition results ($stamp)")
  [void]$lines.Add('')

  $keep = @($results | Where-Object { $_.Decision -eq 'keep' })
  $delete = @($results | Where-Object { $_.Decision -eq 'delete' })
  $replace = @($results | Where-Object { $_.Decision -eq 'replace' })
  $skip = @($results | Where-Object { $_.Decision -eq 'skip' })
  $other = @($results | Where-Object { $_.Decision -notin @('keep', 'delete', 'replace', 'skip') })

  [void]$lines.Add("KEEP ($($keep.Count)):")
  if ($keep.Count -eq 0) { [void]$lines.Add('  (none)') }
  else {
    foreach ($r in $keep) {
      $extra = if ($r.Comment) { " — $($r.Comment)" } else { '' }
      [void]$lines.Add("  - $($r.Name) (rate $($r.Rate))$extra")
    }
  }
  [void]$lines.Add('')
  [void]$lines.Add("DELETE ($($delete.Count)):")
  if ($delete.Count -eq 0) { [void]$lines.Add('  (none)') }
  else {
    foreach ($r in $delete) {
      $extra = if ($r.Comment) { " — $($r.Comment)" } else { '' }
      [void]$lines.Add("  - $($r.Name) (rate $($r.Rate))$extra")
    }
  }
  [void]$lines.Add('')
  [void]$lines.Add("REPLACE ($($replace.Count)):")
  if ($replace.Count -eq 0) { [void]$lines.Add('  (none)') }
  else {
    foreach ($r in $replace) {
      $extra = if ($r.Comment) { " — $($r.Comment)" } else { '' }
      [void]$lines.Add("  - $($r.Name) (rate $($r.Rate))$extra")
    }
  }
  [void]$lines.Add('')
  [void]$lines.Add("SKIP ($($skip.Count)):")
  if ($skip.Count -eq 0) { [void]$lines.Add('  (none)') }
  else {
    foreach ($r in $skip) {
      $extra = if ($r.Comment) { " — $($r.Comment)" } else { '' }
      [void]$lines.Add("  - $($r.Name) (rate $($r.Rate))$extra")
    }
  }
  if ($other.Count -gt 0) {
    [void]$lines.Add('')
    [void]$lines.Add('OTHER:')
    foreach ($r in $other) {
      [void]$lines.Add("  - $($r.Name): $($r.Decision) $($r.Comment)")
    }
  }
  [void]$lines.Add('```')

  $text = $lines -join "`n"
  Write-Host $text

  $outDir = Join-Path (Get-Location) 'samples/dmc'
  $outFile = Join-Path $outDir ("audition-results-{0}.txt" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Set-Content -Path $outFile -Value $text -Encoding utf8
  Write-Host ""
  Write-Host "Also saved to: $outFile" -ForegroundColor DarkGray
}

# ── Classic kit ──────────────────────────────────────────────────────────────
Play-Dmc kick 15 'classic thin kick'
Play-Dmc snare 15 'classic snare'
Play-Dmc clap 15
Play-Dmc bongo 15
Play-Dmc muted_bongo 15
Play-Dmc high_tom 15
Play-Dmc middle_tom 15
Play-Dmc low_tom 15

# ── Feature 109 percussion ───────────────────────────────────────────────────
Play-Dmc kick_punch 15 'phoenix Bass Drum__002 (louder)'
Play-Dmc kick_body 15 'tight sine-drop body'
Play-Dmc snare_tight 15 'Spring Spring lo-fi snare'
Play-Dmc snare_fat 15 'Spring Spring crunchy snare'
Play-Dmc hat_closed 15 'phoenix Hi-hat__002'
Play-Dmc hat_open 15 'Virtuosity acoustic open hat'
Play-Dmc crash 15 'tinny crash synth (kept)'
Play-Dmc crash_cym 15 '808 CY5050 (= cymbal_808)'
Play-Dmc rim 15 'rimshot crack + shell'
Play-Dmc shaker 15 'CC0 Deep Shaker'
Play-Dmc cowbell 15 'original cowbell synth'

# ── Full 808 kit (Michael Fischer WAV / CC0) ─────────────────────────────────
Play-Dmc kick_808 15 'BD0025 thump + BD0000 click (short)'
Play-Dmc snare_808 15 'SD5050 (loudnorm)'
Play-Dmc hat_808 15 'CH (loudnorm)'
Play-Dmc hat_open_808 15 'OH50'
Play-Dmc clap_808 15 'CP'
Play-Dmc cymbal_808 15 'CY5050'
Play-Dmc rim_808 15 'RS'
Play-Dmc cowbell_808 15 'CB'
Play-Dmc maracas_808 15 'MA'
Play-Dmc tom_low_808 15 'LT50'
Play-Dmc tom_mid_808 15 'MT50'
Play-Dmc tom_high_808 15 'HT50'

# ── 909 (kept) ───────────────────────────────────────────────────────────────
Play-Dmc kick_909 15 'GRD JDXi 909 kick'
Play-Dmc snare_909 15 'ani_music 909 snare+clap (CC0)'
Play-Dmc hat_909 15 'GRD JDXi 909 closed hat'
Play-Dmc hat_open_909 15 'GRD JDXi 909 open hat'

# ── Bass / orch / voice ──────────────────────────────────────────────────────
Play-Dmc bass_saw_c0 15 'lowest (C0)'
Play-Dmc bass_saw_d0 15
Play-Dmc bass_saw_e0 15
Play-Dmc bass_saw_g0 15
Play-Dmc bass_saw_a0 15
Play-Dmc bass_saw_c1 15 'highest (C1)'
Play-Dmc orch_hit 15 'SFXMint downward orch hit'
Play-Dmc orch_hit_up 15 'orch_hit pitch-shifted up'
Play-Dmc voice_correct 15 'Kenney Male "correct"'
Play-Dmc voice_go 15 'Kenney Male "go"'
Play-Dmc voice_set 15 'Kenney Male "set"'
Play-Dmc voice_hurry_up 15 'Kenney Male "hurry up"'
Play-Dmc voice_level_up 15 'Kenney Male "level up"'
Play-Dmc voice_go_go_go 15 'Kenney Male "go go go"'
Play-Dmc voice_you_win 15 'Kenney Male "you win"'
Play-Dmc voice_ready 12 'Kenney Male "ready" — encode@15 play@12'

Write-Summary
