#!/bin/bash

######################################## 
#   Usage : 
#   Music/Artist> cdrip Album\ Name
########################################
ALBUM=$*
ARTIST=$(basename "$PWD")
mkdir -p "$ALBUM"
cd "$ALBUM"
cdparanoia -B
eject
wav2flac
echo "Setting metadata ARTIST: ${ARTIST}"
echo "Setting metadata ALBUM: ${ALBUM}"
metaflac --set-tag=ARTIST="${ARTIST}"   *.flac
metaflac --set-tag=ALBUM="${ALBUM}"   *.flac

#cdrip-setdata
