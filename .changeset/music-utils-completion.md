---
"@hansogj/music-utils": minor
---

add `music-utils-completion` — shell tab-completion for every CLI

New bin `music-utils-completion bash` prints a bash completion script that covers all nine `music-utils-*` commands. Flag-name completion for everything, plus file/directory completion for path-valued flags (`-f`/`--fileName` completes files; `-A`/`-B` complete directories; `-a`/`--album` completes directories; positional args on `music-utils-bulk-*` complete directories).

Install (session):

```
source <(music-utils-completion bash)
```

Install (persistent):

```
music-utils-completion bash > ~/.local/share/bash-completion/completions/music-utils
```

Zsh and fish are on the backlog.
