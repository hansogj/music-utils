#!/bin/bash

######################################## 
#   Usage : 
#   Musci/Artist/Album> wav2flac
########################################

for f in *.wav; do flac --keep-foreign-metadata  "$f" ; done

rename 's/track(\d\d)\.cdda.flac/$1 track.flac'/  *.flac
rename 's/Track\s(\d+).flac/$1 track.flac/' *.flac
rename 's/^(\d)\s/0$1 /' *.flac
rm *.wav
cd ../

