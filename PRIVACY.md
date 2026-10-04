# Privacy policy

This policy covers the latex-math plugin for Claude Code, version 0.2.0 and later.

The plugin runs only on your computer. It sends no data over the network, it has no telemetry, and its author receives nothing from it.

## What the plugin reads

- The text of each assistant message that Claude Code draws in the terminal, to find the LaTeX math in it.
- The `theme` setting of Claude Code and, for a custom theme, the theme file in `~/.claude/themes/`, to find the text colour.
- In Ghostty, the output of `ghostty +show-config`, to find the terminal's foreground colour.
- The environment variables `HOME`, `XDG_CACHE_HOME`, `CLAUDE_CONFIG_DIR`, `TERM`, `TERM_PROGRAM`, `KITTY_WINDOW_ID`, `TMUX`, `STY`, `SSH_CONNECTION`, `SSH_TTY`, `CLAUDE_CODE_SESSION_KIND` and `CLAUDE_CODE_FORCE_TERMINAL_IMAGES`, to find the cache folder and to learn whether the terminal draws images.
- The options you set for the plugin.

The plugin reads Claude's replies only to draw them. It does not read your prompts, your files or your credentials.

## What the plugin writes

- One PNG file and one small text file for each formula, in `~/.cache/claude-latex-math/`, or in `$XDG_CACHE_HOME/claude-latex-math/` when that variable is set. The PNG is an image of a formula from a reply, and the text file holds its size. Nothing else from the conversation is written.
- Temporary files for one LaTeX run, which the renderer deletes when the run ends.

## How long the files stay

The cache files stay until the cache grows past the `cacheSizeMB` option, 100 MB by default. When a session starts in the terminal, the plugin deletes the least recently used files until the cache is under that size. You can delete the folder at any time, and the plugin renders each formula again when it needs it.

## What Claude receives

When the plugin draws images, it adds one fixed section of text to Claude's system prompt, so that Claude writes formulas in LaTeX. The README quotes the section in full. The section holds no data about you. You can turn it off with the `promptSection` option.

## Contact

Ask questions about this policy in an issue at [github.com/atomashevic/claude-latex-math/issues](https://github.com/atomashevic/claude-latex-math/issues). Report a security problem as [SECURITY.md](SECURITY.md) describes.
