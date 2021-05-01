#!/bin/sh

################################################################################  
#   Usage : 
#   Music/Artist/2020 Album>  cover.photo.sh 
################################################################################ 


BASEDIR=$(dirname "$0")
node $BASEDIR/../build/run/glyrc.cover.photo.js "$@"
rename -n 's/.*cover.*(.jpeg|.png|.jpg)/cover$1/' *.jpg *.png *.jpeg
gthumb cover.*

