#!/bin/sh
. ./ci/env/setEnvVars.sh

node $MU_BUILD_DIR_CI/ci/rip-album/index.js

. ./ci/env/resetEnvVars.sh
