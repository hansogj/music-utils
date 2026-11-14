#!/bin/sh
. ./ci/env/setEnvVars.sh
. ./ci/env/requireAudio.sh

cd "$MU_TEST_ZEP_1"
require_audio flac ci/tag-tracks/run.sh
TRACKS=../../../raw/tracks.txt
if [ ! -f "$TRACKS" ]; then
  echo "ci/tag-tracks/run.sh: FAILED — $TRACKS not found"
  exit 1
fi
node  $MU_BUILD_DIR/run/tag.tracks.js -f "$TRACKS"

FAIL=0
N=0

# Verify FLAC tags were written with the track names from tracks.txt, in order
for f in *.flac; do
  if [ -f "$f" ]; then
    N=$((N + 1))
    EXPECTED=$(sed -n "${N}p" "$TRACKS")
    TITLE=$(metaflac --show-tag=TITLE "$f" 2>/dev/null | sed 's/TITLE=//')
    TRACKNUMBER=$(metaflac --show-tag=TRACKNUMBER "$f" 2>/dev/null | sed 's/TRACKNUMBER=//')

    if [ "$TITLE" != "$EXPECTED" ]; then
      echo "FAIL: $f expected TITLE '$EXPECTED' from tracks.txt, got '$TITLE'"
      FAIL=1
    fi
    if [ -z "$TRACKNUMBER" ]; then
      echo "FAIL: $f missing TRACKNUMBER tag after tag-tracks"
      FAIL=1
    fi
    echo "OK: $f — TITLE=$TITLE TRACKNUMBER=$TRACKNUMBER"
  fi
done

cd -
. ./ci/env/resetEnvVars.sh

if [ "$FAIL" -eq 1 ]; then
  echo "ci/tag-tracks/run.sh: FAILED"
  exit 1
fi
echo "ci/tag-tracks/run.sh: PASSED"
