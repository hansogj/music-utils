#!/usr/bin/env bash
set -euo pipefail

LIB=/tmp/music-lib

# Helper: create a minimal silent FLAC file
make_flac() {
  local file="$1"
  mkdir -p "$(dirname "$file")"
  ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 0.1 -c:a flac "$file" -y 2>/dev/null
}

# -----------------------------------------------------------------------
# A/Artist Clean/2020 Perfect Album/ -- clean, no issues
# -----------------------------------------------------------------------
DIR="$LIB/A/Artist Clean/2020 Perfect Album"
mkdir -p "$DIR"
F="$DIR/01 - Track One.flac"
make_flac "$F"
metaflac --remove-all-tags   --set-tag="TITLE=Track One"   --set-tag="ARTIST=Artist Clean"   --set-tag="ALBUM=Perfect Album"   --set-tag="DATE=2020"   --set-tag="TRACKNUMBER=1"   "$F"

# -----------------------------------------------------------------------
# WRONG_LETTER_DIR: "The Beatles" under T/ (should be B/)
# -----------------------------------------------------------------------
DIR="$LIB/T/The Beatles/1969 Abbey Road"
mkdir -p "$DIR"
F="$DIR/01 - Come Together.flac"
make_flac "$F"
metaflac --remove-all-tags   --set-tag="TITLE=Come Together"   --set-tag="ARTIST=The Beatles"   --set-tag="ALBUM=Abbey Road"   --set-tag="DATE=1969"   --set-tag="TRACKNUMBER=1"   "$F"

# -----------------------------------------------------------------------
# MISSING_YEAR_PREFIX: album folder has no year at the start
# -----------------------------------------------------------------------
DIR="$LIB/B/Beck/Odelay"
mkdir -p "$DIR"
F="$DIR/01 - Devils Haircut.flac"
make_flac "$F"
metaflac --remove-all-tags   --set-tag="TITLE=Devils Haircut"   --set-tag="ARTIST=Beck"   --set-tag="ALBUM=Odelay"   --set-tag="DATE=1996"   --set-tag="TRACKNUMBER=1"   "$F"

# -----------------------------------------------------------------------
# WRONG_DISC_SEPARATOR: (Disc 1/2) uses regular slash
# -----------------------------------------------------------------------
DIR="$LIB/B/Beck/1999 Midnite Vultures (Disc 1/2)"
mkdir -p "$DIR"
F="$DIR/01 - Sexx Laws.flac"
make_flac "$F"
metaflac --remove-all-tags   --set-tag="TITLE=Sexx Laws"   --set-tag="ARTIST=Beck"   --set-tag="ALBUM=Midnite Vultures"   --set-tag="DATE=1999"   --set-tag="TRACKNUMBER=1"   --set-tag="DISCNUMBER=1"   "$F"

# -----------------------------------------------------------------------
# WRONG_AUX_BRACKETS: {Bonus} uses curly braces instead of square
# -----------------------------------------------------------------------
DIR="$LIB/B/Beck/2000 Mutations {Bonus}"
mkdir -p "$DIR"
F="$DIR/01 - Cold Brains.flac"
make_flac "$F"
metaflac --remove-all-tags   --set-tag="TITLE=Cold Brains"   --set-tag="ARTIST=Beck"   --set-tag="ALBUM=Mutations"   --set-tag="DATE=2000"   --set-tag="TRACKNUMBER=1"   "$F"

# -----------------------------------------------------------------------
# TAG_READ_ERROR: a .flac file that is not a valid FLAC (metaflac fails)
# -----------------------------------------------------------------------
DIR="$LIB/B/Beck/2001 Mellow Gold"
mkdir -p "$DIR"
printf "not a flac file\n" > "$DIR/00 - broken.flac"

# -----------------------------------------------------------------------
# NO_TAGS: valid FLAC but all tags removed
# -----------------------------------------------------------------------
F="$DIR/04 - Loser.flac"
make_flac "$F"
metaflac --remove-all-tags "$F"

# -----------------------------------------------------------------------
# MISSING_TAGS: has title+artist+album+date but no TRACKNUMBER
# -----------------------------------------------------------------------
F="$DIR/05 - Beercan.flac"
make_flac "$F"
metaflac --remove-all-tags   --set-tag="TITLE=Beercan"   --set-tag="ARTIST=Beck"   --set-tag="ALBUM=Mellow Gold"   --set-tag="DATE=1994"   "$F"

# -----------------------------------------------------------------------
# NAME_TAG_MISMATCH: filename says "Corvette Bummer", tag says "Pay No Mind"
# -----------------------------------------------------------------------
F="$DIR/06 - Corvette Bummer.flac"
make_flac "$F"
metaflac --remove-all-tags   --set-tag="TITLE=Pay No Mind"   --set-tag="ARTIST=Beck"   --set-tag="ALBUM=Mellow Gold"   --set-tag="DATE=1994"   --set-tag="TRACKNUMBER=6"   "$F"

# -----------------------------------------------------------------------
# DUPLICATE_TRACKS: two tracks with the same TITLE tag "Soul Suckin Jerk"
# -----------------------------------------------------------------------
F="$DIR/07 - Soul Suckin Jerk.flac"
make_flac "$F"
metaflac --remove-all-tags   --set-tag="TITLE=Soul Suckin Jerk"   --set-tag="ARTIST=Beck"   --set-tag="ALBUM=Mellow Gold"   --set-tag="DATE=1994"   --set-tag="TRACKNUMBER=7"   "$F"

F="$DIR/08 - Soul Suckin Jerk Alt.flac"
make_flac "$F"
metaflac --remove-all-tags   --set-tag="TITLE=Soul Suckin Jerk"   --set-tag="ARTIST=Beck"   --set-tag="ALBUM=Mellow Gold"   --set-tag="DATE=1994"   --set-tag="TRACKNUMBER=8"   "$F"

echo "Fixture library created at $LIB"
find "$LIB" -name "*.flac" | sort
