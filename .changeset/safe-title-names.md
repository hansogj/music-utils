---
'@hansogj/music-utils': patch
---

Album folder and track file names from Discogs titles are made safe like artist folders: `/`, `\` and `:` become ` - `, `* ? " < > |` are dropped, and trailing dots go ("Dexter Calling . . ." → "1961 Dexter Calling"), which an SMB share can't carry. Track file names were not cleaned at all before, nor the artist in them. Tags keep the titles as they are.
