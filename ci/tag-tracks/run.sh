#!/bin/sh
. ./ci/env/setEnvVars.sh

cd "$MU_TEST_ZEP_1"
node  $MU_BUILD_DIR/run/tag.tracks.js -f ../../../raw/tracks.txt
cd -
. ./ci/env/resetEnvVars.sh

