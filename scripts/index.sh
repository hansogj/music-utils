#!/bin/bash

MU_ROOT=$(dirname "$BASH_SOURCE")

function __music_util_version() {
    builtin cd $MU_ROOT
    printf "Running %s@%s \n\n" $(npm pkg get name) $(npm pkg get version)
    builtin cd -
}

function __wget-cover-photo() {
    local target="$2"
    if [ -z "$2" ]; then target="."; fi
    local ext=(${1//./ })
    echo $target/cover.${ext[-1]}
    wget -O "$target/cover.${ext[-1]}" $1
}

alias music-utils-rip="__music_util_version && $MU_ROOT/cdrip.sh"
alias music-utils-rip-off="__music_util_version && $MU_ROOT/ripoff.sh"
alias music-utils-cover-photo="__music_util_version && $MU_ROOT/cover.photo.sh"
alias music-utils-wget-cover-photo="__music_util_version && __wget-cover-photo"
alias music-utils-album-tag="__music_util_version && $MU_ROOT/tag.album.sh"
alias music-utils-tracks-tag="__music_util_version && $MU_ROOT/tag.tracks.sh"
alias music-utils-sync-tracks-names="__music_util_version && $MU_ROOT/sync.track.names.sh"
alias music-utils-bulk-album-tag="__music_util_version && $MU_ROOT/tag.all.album.sh"
alias music-utils-album-cover="__music_util_version && $MU_ROOT/tag.cover.album.sh"

function music-utils-bulk-cover-photo() {
    __music_util_version
    for DIR in */; do
        echo "$DIR"
        {
            [ ! -e "$DIR"/*jpg* ] && "$MU_ROOT/cover.photo.sh" -Q -a "$DIR"
        } || {
            echo ""
        }
    done

}

export -f music-utils-bulk-cover-photo
