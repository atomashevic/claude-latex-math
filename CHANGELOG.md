# Changelog

## 0.2.0 (not released)

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
- PRIVACY.md, SECURITY.md, and sections in the README on settings, troubleshooting, privacy and support.

### Changed

- The system prompt section is added only when the mod draws images.
- The demo renders with `bin/render.sh` at a higher resolution, instead of a copy of the script.

## 0.1.0 (2026-10-04)

- First version: display and inline LaTeX math as images through the kitty graphics protocol, in the text colour of the Claude Code theme.
