#!/bin/sh

MU_ROOT=`dirname "$BASH_SOURCE"`

alias music-utils-rip="$MU_ROOT/cdrip.sh"
alias music-utils-cover-photo="$MU_ROOT/cover.photo.sh"
alias music-utils-glyrc-cover-photo="$MU_ROOT/glyrc.cover.photo.sh"
alias music-utils-album-tag="$MU_ROOT/tag.album.sh"
alias music-utils-tracks-tag="$MU_ROOT/tag.tracks.sh"
alias music-utils-bulk-album-tag="$MU_ROOT/tag.all.album.sh"
alias music-utils-album-cover="$MU_ROOT/tag.cover.album.sh"

 function music-utils-bulk-glyrc-cover-photo() {
    for DIR in */;
    do
    echo "$DIR"
     {
        [ ! -e "$DIR"/*jpg* ] && "$MU_ROOT/glyrc.cover.photo.sh" -Q -a "$DIR" ;
     } || {
        echo ""
     }
    done; 

}

export -f music-utils-bulk-glyrc-cover-photo






