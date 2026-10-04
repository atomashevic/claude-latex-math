# Security policy

## Supported versions

Only the latest version of latex-math gets security fixes.

## Report a vulnerability

Report a vulnerability privately through GitHub: open the **Security** tab of [atomashevic/claude-latex-math](https://github.com/atomashevic/claude-latex-math), then select **Report a vulnerability**. Do not open a public issue for it.

Give the version of the plugin, the output of `claude --version`, your system, and the steps or the formula that show the problem.

The answer comes in the private report. A confirmed problem gets a fix in a new version, and the [CHANGELOG](CHANGELOG.md) names it.

## What the plugin runs

The plugin runs `latex` on formulas that the model writes, so it treats each formula as untrusted input:

- It renders a formula only when every command in it is on the list of math commands in `hooks/commands.ts`. The list has no command that reads a file, defines a macro, or changes how LaTeX reads its input.
- `latex` runs with shell escape off (`-no-shell-escape`) and with `openout_any=p`, which limits writes to the temporary work folder. `dvipng` runs with Ghostscript off.

LaTeX does not limit which files a formula can read, so the command list is the protection against that. Version 0.2.0 and earlier have no such list: update to 0.3.0 or later.

A formula that passes the list and still reads a file, writes outside the work folder, or runs a program is a vulnerability. Please report it.
