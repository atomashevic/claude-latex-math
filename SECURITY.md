# Security policy

## Supported versions

Only the latest version of latex-math gets security fixes.

## Report a vulnerability

Report a vulnerability privately through GitHub: open the **Security** tab of [atomashevic/claude-latex-math](https://github.com/atomashevic/claude-latex-math), then select **Report a vulnerability**. Do not open a public issue for it.

Give the version of the plugin, the output of `claude --version`, your system, and the steps or the formula that show the problem.

The answer comes in the private report. A confirmed problem gets a fix in a new version, and the [CHANGELOG](CHANGELOG.md) names it.

## What the plugin runs

The plugin runs `latex` on formulas that the model writes. The renderer turns shell escape off (`-no-shell-escape`) and sets `openin_any=p` and `openout_any=p`, which stop a formula from opening a file by an absolute path or in a parent directory. A formula that gets past these limits is a vulnerability. Please report it.
