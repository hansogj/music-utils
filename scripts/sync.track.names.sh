#!/bin/sh

################################################################################  
#   Usage : 
#   Music/Artist/2020 Album>  sync.track.names
################################################################################ 


BASEDIR=$(dirname "$0")
node $BASEDIR/../build/run/sync.track.names "$@"
ls -l "$@"

