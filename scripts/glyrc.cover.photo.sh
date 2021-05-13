#!/bin/sh

################################################################################  
#   Usage : 
#   Music/Artist/2020 Album>  cover.photo.sh 
################################################################################ 


BASEDIR=$(dirname "$0")
node $BASEDIR/../build/run/glyrc.cover.photo.js "$@"

