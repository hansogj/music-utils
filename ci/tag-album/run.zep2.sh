#!/bin/sh
. ./ci/env/setEnvVars.sh

cd "$MU_TEST_ZEP_2"
node  $MU_BUILD_DIR/run/tag.album.js

FAIL=0

# Verify FLAC tags were written correctly
for f in *.flac; do
  if [ -f "$f" ]; then
    TITLE=$(metaflac --show-tag=TITLE "$f" 2>/dev/null | sed 's/TITLE=//')
    TRACKNUMBER=$(metaflac --show-tag=TRACKNUMBER "$f" 2>/dev/null | sed 's/TRACKNUMBER=//')
    ARTIST=$(metaflac --show-tag=ARTIST "$f" 2>/dev/null | sed 's/ARTIST=//')
    DISCNUMBER=$(metaflac --show-tag=DISCNUMBER "$f" 2>/dev/null | sed 's/DISCNUMBER=//')

    if [ -z "$TITLE" ]; then
      echo "FAIL: $f missing TITLE tag"
      FAIL=1
    fi
    if [ -z "$TRACKNUMBER" ]; then
      echo "FAIL: $f missing TRACKNUMBER tag"
      FAIL=1
    fi
    if [ -z "$ARTIST" ]; then
      echo "FAIL: $f missing ARTIST tag"
      FAIL=1
    fi
    if [ "$DISCNUMBER" != "2" ]; then
      echo "FAIL: $f expected DISCNUMBER=2, got '$DISCNUMBER'"
      FAIL=1
    fi
    echo "OK: $f — TITLE=$TITLE TRACKNUMBER=$TRACKNUMBER ARTIST=$ARTIST"
  fi
done

cd -
. ./ci/env/resetEnvVars.sh

if [ "$FAIL" -eq 1 ]; then
  echo "ci/tag-album/run.zep2.sh: FAILED"
  exit 1
fi
echo "ci/tag-album/run.zep2.sh: PASSED"
