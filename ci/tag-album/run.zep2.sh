#!/bin/sh
. ./ci/env/setEnvVars.sh

cd "$MU_TEST_ZEP_2"
node  $MU_BUILD_DIR/run/tag-album.js
cd -
. ./ci/env/resetEnvVars.sh

