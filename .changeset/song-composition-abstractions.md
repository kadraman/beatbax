---
"@beatbax/engine": minor
---

Add compile-time song composition abstractions (`alias`, `cat()`, `section`, `form`, channel `role`/`form`, Beginner Mode) that lower to classic `seq`/`channel` before resolve. Beginner Mode supports Game Boy 4-lane `channel auto` and NES/Famicom 4|5-lane profiles (optional trailing `dmc`); generated `section_role` seq names that collide with existing seqs now error instead of silently overwriting.
