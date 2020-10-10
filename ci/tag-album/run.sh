#!/bin/sh
. ./ci/env/setEnvVars.sh

cd "$MU_TEST_ZEP_1"
node $MU_BUILD_DIR_CI/ci/tag-album/index.js
cd -
cd "$MU_TEST_ACC" 
node $MU_BUILD_DIR_CI/ci/tag-album/index.js
cd -
. ./ci/env/resetEnvVars.sh

