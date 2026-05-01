#!/bin/sh

################################################################################
#   Usage :
#   ./>  rip.sh rId
# creates folders Music/Artist/2020 Album
################################################################################


BASEDIR=$(dirname "$0")
node $BASEDIR/../build/run/rip.js "$@"
