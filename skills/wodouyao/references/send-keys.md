# send-keys literal reference

Token table for `wodouyao send <peer> --keys "<spec>"`. Tokens are whitespace-separated. Unknown tokens pass through as literal text bytes. Wrap a token in `{...}` to force literal interpretation (e.g. `{C-c}` sends the three characters `C-c`, not Ctrl-C).

Adjacent key literals emit no separator; text tokens get a space between them.

## Control codes

| Token | Byte(s) | Notes |
|---|---|---|
| `C-a` .. `C-z` | `0x01`–`0x1a` | case-insensitive (`C-a` == `C-A`) |
| `C-Space`, `C-@` | `0x00` | null |
| `C-[` | `0x1b` | same as Escape |
| `C-\` | `0x1c` | |
| `C-]` | `0x1d` | |

## Named keys

| Token | Byte(s) |
|---|---|
| `Enter`, `Return` | `0x0d` |
| `Tab` | `0x09` |
| `Escape`, `Esc` | `0x1b` |
| `Space` | `0x20` |
| `BSpace`, `Backspace` | `0x7f` |

## Arrows and navigation

| Token | Sequence |
|---|---|
| `Up` | `\x1b[A` |
| `Down` | `\x1b[B` |
| `Right` | `\x1b[C` |
| `Left` | `\x1b[D` |
| `PageUp`, `PPage` | `\x1b[5~` |
| `PageDown`, `NPage` | `\x1b[6~` |
| `Home` | `\x1b[H` |
| `End` | `\x1b[F` |

## Meta prefix

`M-<key>` emits `0x1b` followed by the recursive encoding of `<key>`. Examples:

- `M-x` → `0x1b 'x'`
- `M-Enter` → `0x1b 0x0d`
- `M-C-c` → `0x1b 0x03`

## Common recipes

| Goal | Spec |
|---|---|
| Submit a command | `<cmd> Enter` |
| Interrupt running process | `C-c` |
| Kill line in readline | `C-u` |
| Exit REPL cleanly | `C-d` |
| Clear screen | `C-l` |
| Accept autocomplete | `Tab` |
| Vim `:wq` | `Escape : w q Enter` |
| tmux prefix + new window | `C-b c` |
