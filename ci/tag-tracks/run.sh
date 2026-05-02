#!/bin/sh
. ./ci/env/setEnvVars.sh

cd "$MU_TEST_ZEP_1"
node  $MU_BUILD_DIR/run/tag.tracks.js -f ../../../raw/tracks.txt

FAIL=0

# Verify FLAC tags were written with track names from tracks.txt
for f in *.flac; do
  if [ -f "$f" ]; then
    TITLE=$(metaflac --show-tag=TITLE "$f" 2>/dev/null | sed 's/TITLE=//')
    TRACKNUMBER=$(metaflac --show-tag=TRACKNUMBER "$f" 2>/dev/null | sed 's/TRACKNUMBER=//')

    if [ -z "$TITLE" ]; then
      echo "FAIL: $f missing TITLE tag after tag-tracks"
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
