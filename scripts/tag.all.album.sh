#!/bin/sh

################################################################################  
#   Usage : 
#   Music/Artist/> ls 
#   
#   2000 Abum I 
#   20002 Album II 
#
#   #   Music/Artist/> tag.all.album.sh
################################################################################ 
BASEDIR=$(dirname "$0")

DIR='.'
if [ -d "$1" ]; then DIR="$1"; fi
   
ls "$DIR"
for D in "$DIR"/* ;
 do
 if [ -d "$D" ]; then
    echo "$D"
    node $BASEDIR/../build/run/tag.album.js -a "$D"
 fi
 done


