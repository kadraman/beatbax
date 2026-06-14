!macro customHeader
  ; electron-builder derives the NSIS install folder from package.json "name".
  ; Scoped names like @beatbax/desktop become "@beatbaxdesktop"; use productName instead.
  !define /redef APP_FILENAME "BeatBax"
!macroend
