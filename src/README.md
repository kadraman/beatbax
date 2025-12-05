PROJECT:

Build a 3-day MVP of a Strudel-like live-coding language for Game Boy chiptune.



This MVP must support:

\- Live pattern playback

\- Authentic 4-channel Game Boy sound model

\- JSON + MIDI export

\- Deterministic timing



DO NOT implement .uge binary export yet.

This version is for fast validation and live performance testing.



---------------------------------

MVP SCOPE (STRICT)

---------------------------------



Channels (fixed):

1\. Pulse 1 – duty + envelope (no sweep yet)

2\. Pulse 2 – duty + envelope

3\. Wave – 16-sample wavetable

4\. Noise – LFSR noise



Language features:

\- inst definitions

\- pat definitions

\- channel routing

\- notes (C3–B8)

\- rests (.)

\- octave transpose

\- bpm control



Syntax baseline:



inst lead  type=pulse1 duty=50 env=12,down

inst bass  type=pulse2 duty=25 env=10,down

inst wave1 type=wave wave=\[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]

inst snare type=noise env=12,down



pat A = C5 E4 G4 C5

pat B = C3 . G2 .



channel 1 => inst lead pat A bpm=140

channel 2 => inst bass pat B

channel 3 => inst wave1 pat A:oct(-1)

channel 4 => inst snare pat "x . x x"



play

export json "song.json"

export midi "song.mid"



---------------------------------

TECH STACK

---------------------------------



\- TypeScript

\- Node.js + optional browser demo

\- WebAudio for playback

\- No frameworks



---------------------------------

REQUIRED PROJECT STRUCTURE

---------------------------------



/src

&nbsp; /parser        → simple tokenizer + parser

&nbsp; /patterns      → pattern expansion

&nbsp; /scheduler     → tick clock

&nbsp; /audio         → GB channel emulation

&nbsp; /export

&nbsp;   jsonExport.ts

&nbsp;   midiExport.ts

&nbsp; index.ts



---------------------------------

DAY 1 TARGET:

---------------------------------

\- Tokenize + parse the language.

\- Build AST.

\- Build a resolved song model.

\- Export to validated JSON.

\- Include unit tests for:

&nbsp; - note → frequency

&nbsp; - pattern expansion



---------------------------------

DAY 2 TARGET:

---------------------------------

\- Implement WebAudio playback.

\- Implement:

&nbsp; - Two pulse oscillators with duty control

&nbsp; - Wavetable playback for wave channel

&nbsp; - White noise + envelope for noise channel

\- Implement a deterministic tick scheduler.

\- Enable real-time playback from parsed text.



---------------------------------

DAY 3 TARGET:

---------------------------------

\- Implement MIDI export (4 tracks).

\- Implement live reloading of patterns.

\- Add per-channel mute/solo.

\- Add a minimal CLI:



&nbsp; node index.js play song.sgb

&nbsp; node index.js export json song.sgb

&nbsp; node index.js export midi song.sgb



---------------------------------

QUALITY RULES

---------------------------------



\- No stub audio.

\- No random timing jitter.

\- No hardcoded frequencies without explanation.

\- All channels must be independent.

\- All scheduling must be deterministic.

\- Every file must have concise doc comments.



---------------------------------

OUTPUT

---------------------------------



At the end of the MVP, the tool must:

\- Parse a song script

\- Play it live

\- Export to JSON

\- Export to MIDI

\- Run from the command line



Start by scaffolding the TypeScript project and implementing the tokenizer.



