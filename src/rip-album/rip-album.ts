import { Release } from '../types';
import { exit } from '../utils/color.log';
/* ALBUM=$*
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
 */
import { albumPrompt } from '../utils/prompt';

export const ripAlbum = () => {
  albumPrompt({}).then(({ artist, album, year, discnumber, noOfDiscs }: Partial<Release>) => {
    const vitals = [artist, album, year].filter((tagInfo) => !tagInfo);

    if (vitals.length) {
      exit('Cannot rip album with missing vitals');
    }

    const discNumAsString = discnumber ? `(disc ${[discnumber, noOfDiscs].defined().join('/')})` : '';
    console.log(`mkdir : ./${artist}/${[year, album, discNumAsString].defined().join(' ')} `);
  });
};
