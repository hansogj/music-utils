---
"@hansogj/music-utils": patch
---

fix: reject nonsensical `noOfDiscs < discNumber` in the disc-info prompt

`music-utils-rip` (and any command that goes through `userDefinedPrompt`) now rejects a total-discs value smaller than the disc being ripped. Previously the prompt happily accepted "disc 2 of 1", which then produced a broken folder suffix like `(Disc 2∕1)` and downstream tag issues.

Blank inputs (meaning "keep original") skip the check and fall back to the release's existing values, so you can leave either field alone without a spurious error.

Also drops the dead `DEFINITE_ARTICLES` export from `constants.ts` (moved into `config.artist.articles` a while ago; still inlined into `BLACK_LIST_SIMILAR_WORD` for the similarity engine, which is intentionally decoupled from the sort-order transform).
