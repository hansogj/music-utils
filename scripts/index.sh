#!/bin/sh

MU_ROOT=`dirname "$BASH_SOURCE"`

echo "LOADINGF music util from $MU_ROOT"

alias music-utils-rip="$MU_ROOT/cdrip.sh"
alias music-utils-cover-photo="$MU_ROOT/cover.photo.sh"
alias music-utils-glyrc-cover-photo="$MU_ROOT/glyrc.cover.photo.sh"
alias music-utils-album-tag="$MU_ROOT/tag.album.sh"
alias music-utils-tracks-tag="$MU_ROOT/tag.tracks.sh"
alias music-utils-bulk-album-tag="$MU_ROOT/tag.all.album.sh"
function music-utils-bulk-glyrc-cover-photo() {
    for DIR in *;
    do
    echo "$DIR"
      [ ! -e "$DIR"/*jpg* ] && "$MU_ROOT/glyrc.cover.photo.sh" -Q -a "$DIR" ;
    done; 
    music-copy-first-cover
}

export -f music-utils-bulk-glyrc-cover-photo






