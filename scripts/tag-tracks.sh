#!/bin/sh

################################################################################  
#   Usage : 
#   Musci/Artist/2020 Album>  tag-tracks.sh -f /path/to/tracks.txt 
################################################################################ 


BASEDIR=$(dirname "$0")
node $BASEDIR/../build/run/tag-tracks.js $@

