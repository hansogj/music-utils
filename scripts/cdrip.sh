#!/bin/bash

######################################## 
#   Usage : 
#   Music/Artist> cdrip Album\ Name
########################################
BASEDIR=$(dirname "$0")
ALBUM=$*
ARTIST=$(basename "$PWD")
mkdir -p "$ALBUM"
cd "$ALBUM"
cdparanoia -B
eject
sh $BASEDIR/wav2flac.sh
$BASEDIR/tag.album.sh
cd -
#cdrip-setdata
