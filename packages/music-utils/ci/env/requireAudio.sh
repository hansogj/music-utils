#!/bin/sh
# Stops a CI script when the test album has no audio files: the tag checks would
# otherwise loop over nothing and report PASSED.
# Usage (inside the album folder): require_audio <ext> <script name>
require_audio() {
  for f in ./*."$1"; do
    [ -f "$f" ] && return 0
  done
  echo "$2: FAILED — no .$1 test files in $PWD"
  exit 1
}
