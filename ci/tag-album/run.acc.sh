#!/bin/sh
. ./ci/env/setEnvVars.sh

cd "$MU_TEST_ACC"
node  $MU_BUILD_DIR/run/tag.album.js

FAIL=0

# Verify MP3 tags were written correctly
for f in *.mp3; do
  if [ -f "$f" ]; then
    OUTPUT=$(id3v2 -l "$f" 2>/dev/null)
    TITLE=$(echo "$OUTPUT" | grep 'TIT2' | head -1)
    ARTIST=$(echo "$OUTPUT" | grep 'TPE1' | head -1)
    TRACK=$(echo "$OUTPUT" | grep 'TRCK' | head -1)

    if [ -z "$TITLE" ]; then
      echo "FAIL: $f missing TIT2 (title) tag"
      FAIL=1
    fi
    if [ -z "$ARTIST" ]; then
      echo "FAIL: $f missing TPE1 (artist) tag"
      FAIL=1
    fi
    if [ -z "$TRACK" ]; then
      echo "FAIL: $f missing TRCK (track number) tag"
      FAIL=1
    fi
    echo "OK: $f — $TITLE | $ARTIST | $TRACK"
  fi
done

cd -
. ./ci/env/resetEnvVars.sh

if [ "$FAIL" -eq 1 ]; then
  echo "ci/tag-album/run.acc.sh: FAILED"
  exit 1
fi
echo "ci/tag-album/run.acc.sh: PASSED"
