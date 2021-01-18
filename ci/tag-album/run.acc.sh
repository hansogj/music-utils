#!/bin/sh
. ./ci/env/setEnvVars.sh

cd "$MU_TEST_ACC"
node  $MU_BUILD_DIR/run/tag-album.js
cd -
. ./ci/env/resetEnvVars.sh

