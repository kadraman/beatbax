================================================================================
  BeatBax Desktop - Version {{VERSION}}
================================================================================

ABOUT
-----

BeatBax is a live coding language and creative toolchain for making chiptune
music in the style of classic 8/16-bit computers and game consoles. Instead of
using a tracker or DAW, you write songs in a simple text-based grammar (.bax
files) describing instruments, melodies, basslines, and beats — and BeatBax
brings them to life with authentic retro sound.

BeatBax Desktop is a full-featured IDE for editing .bax songs: with interactive
song editor, channel mixer/visualzer, native file dialogs, exports to tracker
and audio formats, BeatBax Copilot (AI assistant) and more.

Built-in sound chips include Nintendo Game Boy (DMG-01) and Nintendo
Entertainment System (NES) with additional chips available as plugins.

Project home: {{HOMEPAGE}}


SYSTEM REQUIREMENTS
-------------------

  Windows 10 or later (64-bit), macOS 11 or later, or a recent Linux distro
  with GTK 3 and PulseAudio or PipeWire.


INSTALLING
----------

  Desktop installers are published on GitHub Releases (tags desktop-v*).
  Download the setup program for your platform from:

    {{RELEASES_URL}}

  Installers are not code-signed yet. Your operating system may show a security
  warning the first time you install or run BeatBax. The app is open source;
  you can review the source at {{REPOSITORY}} if you wish.

  Windows (BeatBax-*-setup.exe or portable .exe)
    If SmartScreen shows "Windows protected your PC", click "More info", then
    "Run anyway". The installer is built by the project's public CI workflow.

  macOS (.dmg or .zip)
    If Gatekeeper says the app cannot be opened, right-click BeatBax in
    Applications and choose Open, then confirm. Alternatively, open System
    Settings -> Privacy & Security and allow the app when prompted.

  Linux (.AppImage or .deb)
    For AppImage: make the file executable (chmod +x) if needed, then run it.
    For .deb: install with your package manager (e.g. sudo dpkg -i BeatBax-*.deb).

  See RELEASE-NOTES.txt in this folder for changes in the version you installed.


COPYRIGHT AND LICENSE
---------------------

  Copyright (c) {{COPYRIGHT_YEAR}} Kevin A. Lee and BeatBax Contributors

  BeatBax is open source software released under the MIT License.
  See the project repository for the full license text and third-party
  notices:

    {{REPOSITORY}}


UPDATES
-------

  New desktop releases are published on GitHub:

    {{RELEASES_URL}}

  Look for installers tagged desktop-v* (for example, desktop-v0.1.0).
  Download the setup program for your platform and run it to upgrade.

  When a newer version is available, install it over your existing
  installation or uninstall the old version first. See RELEASE-NOTES.txt in
  this folder for what changed in the version you installed.

  Your .bax song files are not removed by uninstalling the app. Application
  settings are stored in your user profile and are kept unless you choose to
  remove them.

  Try BeatBax in your browser (web-lite, no install required):

    https://app.beatbax.com


EXAMPLE SONGS
-------------

  This installation includes complete example songs in the "songs" folder next
  to the BeatBax application. Use File -> Open and browse to sound chip directory
  (e.g. songs/gameboy) to open them.


SUPPORT AND DOCUMENTATION
-------------------------

  Repository:       {{REPOSITORY}}
  Tutorial:         {{REPOSITORY}}/blob/main/TUTORIAL.md
  Report issues:    {{REPOSITORY}}/issues


Thank you for using BeatBax!
