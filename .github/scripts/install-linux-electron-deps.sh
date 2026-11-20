#!/usr/bin/env bash
# Install packages needed to run Electron under Xvfb on GitHub-hosted Ubuntu.
# ubuntu-latest ships google-chrome.list; dl.google.com occasionally
# serves inconsistent Packages.gz (Hash Sum mismatch) and fails the job.
# BeatBax only needs Ubuntu archive packages for Electron/Xvfb.
set -euo pipefail

sudo rm -f /etc/apt/sources.list.d/google-chrome.list \
  /etc/apt/sources.list.d/google-chrome.sources \
  /etc/apt/sources.list.d/google-chrome*.list
sudo apt-get update
sudo apt-get install -y xvfb libgtk-3-0 libnotify4 libnss3 libxss1 libasound2t64 libgbm1
