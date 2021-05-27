#!/bin/sh

################################################################################  
#   Usage : 
#   Music/Artist/2020 Album>  tag-album.sh 
################################################################################ 


BASEDIR=$(dirname "$0")
node $BASEDIR/../build/run/glyrc.cover.photo.js "-Q" "$@" 
node $BASEDIR/../build/run/tag.album.js "$@"

