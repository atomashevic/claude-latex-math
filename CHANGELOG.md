# Changelog

## 0.3.0 (2026-10-04)

### Security

- The mod renders a formula only when every command in it is on a list of math commands (`hooks/commands.ts`). Before, any formula went to LaTeX, and LaTeX can read every file that the user can read. A formula with another command now shows as its source, with the reason.
- `tools/commands.py` builds the list and probes it: each listed command is called with a canary command name and a canary file in every argument position. CI runs the probe.
- `dvipng` runs with Ghostscript off and stops after 20 seconds. A picture larger than 255 terminal cells in either direction is refused.

### Fixed

- The README and SECURITY.md said that the `openin_any` setting stops a formula from reading files. TeX Live 2026 made that setting a no-op. The documents now describe the command list.

### Changed

- The system prompt section asks Claude to use only the commands of LaTeX and amsmath.
- The line under a formula that is not rendered starts with `not rendered:`.
- The notice about missing tools points to the README and has no link.
- The README says what each hook changes, which programs the mod runs, and what it reads and sends.

## 0.2.0 (2026-10-04)

### Added

- Options in `/config`: `images`, `inline`, `promptSection`, `scale` and `cacheSizeMB`.
- Math as Unicode text in terminals without the kitty graphics protocol, inside tmux or screen, and in background sessions, where Claude Code draws no images. A display formula that Unicode cannot hold becomes a LaTeX code block.
- One notice at the start of a session when the renderer misses a tool or a LaTeX package. Math is then Unicode text.
- Images over SSH: the mod sends the PNG bytes, because the terminal cannot read files on the remote machine.
- A limit on the image cache. When a session starts in the terminal, the least recently used images are deleted until the cache is under `cacheSizeMB`. A deleted image that a session still shows is rendered again.
- A limit of 60 different formulas typeset per reply. A reply that needs more is written as Unicode text.
- `bin/render.sh --check`, which lists the missing tools and LaTeX packages.
- Support for ImageMagick 6, as Debian and Ubuntu ship it.
- CI: `claude plugin validate`, `claude plugin test`, `shellcheck`, and a test of the renderer on real formulas on Ubuntu 24.04.
- PRIVACY.md, SECURITY.md, and sections in the README on settings, troubleshooting, privacy, support, and what the mod runs, reads and sends.
- A plugin icon: a typeset sum and a terminal prompt.

### Changed

- The system prompt section is added only when the mod draws images.
- The mod reads only the `theme` row of `/config`, not the whole settings object.
- The demo renders with `bin/render.sh` at a higher resolution, instead of a copy of the script.

## 0.1.0 (2026-10-04)

- First version: display and inline LaTeX math as images through the kitty graphics protocol, in the text colour of the Claude Code theme.
