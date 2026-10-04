#!/usr/bin/env python3
"""Builds and probes hooks/commands.ts: the LaTeX commands that a formula may use.

A formula comes from the model, and LaTeX can read any file that the user can read. So the mod
renders a formula only when every command in it is on a list of math commands (hooks/guard.ts).

  commands.py generate   Writes hooks/commands.ts from the LaTeX on this machine.
  commands.py probe      Calls every listed command and environment with a canary command name and
                         a canary file in each argument position. It fails when LaTeX runs the name,
                         opens the file or any file outside its own tree, or leaves a category code
                         changed.

Both need latex. The list has four parts:
  symbols       every \\mathchar that the math packages define: one glyph, with no code behind it;
  composites    macros without parameters from the same packages that print in math mode;
  CURATED       the structural commands below, each one a decision of the author;
  PRIMITIVES    the typesetting primitives below.
A static analysis of LaTeX's own code cannot be complete, so the probe is what the list rests on.
"""
import argparse
import concurrent.futures
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'hooks' / 'commands.ts'

# Where symbols and composites come from: the files that define LaTeX's math vocabulary.
MATH_SOURCES = ['fontmath.ltx', 'amsmath.sty', 'amssymb.sty', 'amsfonts.sty', 'amsopn.sty', 'amsbsy.sty',
                'amstext.sty', 'mathtools.sty', 'bm.sty']

PRIMITIVES = '''
left right middle limits nolimits displaylimits displaystyle textstyle scriptstyle scriptscriptstyle
mathbin mathrel mathop mathord mathopen mathclose mathpunct mathinner mathchoice
kern mkern mskip hskip hfil hfill hbox relax
'''.split()

CURATED = '''
frac dfrac tfrac cfrac binom dbinom tbinom genfrac sqrt over atop choose brace brack
hat widehat tilde widetilde bar vec dot ddot dddot ddddot acute grave breve check mathring
overline underline overbrace underbrace overrightarrow overleftarrow overleftrightarrow
underrightarrow underleftarrow underleftrightarrow overbracket underbracket
mathbf mathrm mathit mathsf mathtt mathcal mathbb mathfrak mathnormal boldsymbol bm pmb
text textbf textit textrm textsf texttt textnormal textup emph mbox
operatorname operatornamewithlimits lim sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh coth
log ln lg exp max min sup inf det gcd Pr arg dim ker deg hom limsup liminf injlim projlim
varlimsup varliminf varinjlim varprojlim
sum prod coprod int oint iint iiint iiiint idotsint
bigcup bigcap bigsqcup biguplus bigvee bigwedge bigoplus bigotimes bigodot
big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr Biggl Biggr bigm Bigm biggm Biggm
quad qquad enspace enskip thinspace medspace thickspace negthinspace negmedspace negthickspace
hspace mspace phantom hphantom vphantom smash mathstrut strut
stackrel overset underset overunderset substack sideset
xrightarrow xleftarrow xleftrightarrow xRightarrow xLeftarrow xLeftrightarrow xmapsto
xhookrightarrow xhookleftarrow xrightharpoonup xrightharpoondown xleftharpoonup xleftharpoondown
xrightleftharpoons xleftrightharpoons
prescript mathclap mathllap mathrlap clap llap rlap smashoperator adjustlimits cramped
tag notag nonumber label ref eqref intertext shortintertext allowbreak displaybreak shoveleft shoveright
begin end
boxed fbox Aboxed
pmod bmod mod pod dots ldots cdots vdots ddots dotsb dotsc dotsi dotsm dotso
hline cline multicolumn hdotsfor
not ensuremath colon implies impliedby iff
'''.split()

ENVIRONMENTS = '''
equation equation* align align* gather gather* multline multline* alignat alignat* flalign flalign*
eqnarray eqnarray* split aligned gathered alignedat multlined lgathered rgathered
cases cases* dcases dcases* rcases rcases* drcases drcases*
matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix matrix* pmatrix* bmatrix* Bmatrix* vmatrix* Vmatrix*
smallmatrix psmallmatrix bsmallmatrix Bsmallmatrix vsmallmatrix Vsmallmatrix
smallmatrix* psmallmatrix* bsmallmatrix* Bsmallmatrix* vsmallmatrix* Vsmallmatrix*
array subarray spreadlines subequations
'''.split()

# Commands that the guard refuses, and what the probe must see when one of them is called.
# A probe that does not see these is broken.
CONTROLS = {'input': 'FILE', 'InputIfFileExists': 'FILE', 'UseName': 'EXEC', 'pdffilesize': 'READ',
            'IfFileExists': 'READ', 'makeatletter': 'DRIFT'}


def preamble() -> str:
    return subprocess.run(['bash', str(ROOT / 'bin' / 'render.sh'), '--preamble'],
                          check=True, capture_output=True, text=True).stdout


def latex(source: str, work: Path, *flags: str, seconds: int = 120) -> None:
    (work / 'f.tex').write_text(source, encoding='latin-1')
    env = {**os.environ, 'max_print_line': '1000000', 'openout_any': 'p'}
    try:
        subprocess.run(['latex', '-no-shell-escape', *flags, 'f.tex'], cwd=work, env=env, timeout=seconds,
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        pass


def kpsewhich(*args: str) -> str:
    return subprocess.run(['kpsewhich', *args], capture_output=True, text=True).stdout.strip()


# Generate.

def candidates() -> list[str]:
    """Every letters-only command name that LaTeX's math source files mention."""
    names = set()
    for source in MATH_SOURCES:
        path = kpsewhich(source)
        if path:
            names |= set(re.findall(r'\\([A-Za-z]+)', Path(path).read_text(encoding='latin-1')))
    return sorted(names)


def meanings(names: list[str], work: Path) -> dict[str, str]:
    r"""\meaning of each name that the format defines."""
    lines = [preamble(), r'\begin{document}', r'\newwrite\out', r'\immediate\openout\out=meanings.txt',
             r'\def\dump#1{\ifcsname #1\endcsname',
             r'  \immediate\write\out{#1 => \expandafter\meaning\csname #1\endcsname}\fi}']
    lines += [r'\dump{%s}' % name for name in names]
    lines += [r'\immediate\closeout\out', 'x', r'\end{document}', '']
    latex('\n'.join(lines), work, '-interaction=nonstopmode')
    found = {}
    for line in (work / 'meanings.txt').read_text(encoding='latin-1').split('\n'):
        if ' => ' in line:
            name, meaning = line.split(' => ', 1)
            found[name] = meaning
    return found


def prints_chunk(names: list[str]) -> set[str]:
    printing, rest = set(), list(names)
    work = Path(tempfile.mkdtemp(prefix='lmcommands'))
    try:
        while rest:
            lines = [preamble(), r'\begin{document}', r'\newwrite\out', r'\immediate\openout\out=prints.txt',
                     r'\scrollmode']
            for name in rest:
                lines += [r'\message{<<%s>>}' % name,
                          r'\setbox0\hbox{$\%s$}\immediate\write\out{%s \the\wd0}' % (name, name)]
            lines += [r'\message{<<>>}', r'\end{document}', '']
            (work / 'prints.txt').unlink(missing_ok=True)
            latex('\n'.join(lines), work, '-interaction=scrollmode', seconds=15)
            log = (work / 'f.log').read_text(encoding='latin-1') if (work / 'f.log').exists() else ''
            failed = {m.group(1) for m in re.finditer(r'<<(\w+)>>((?:(?!<<).)*?)\n!', log, re.S)}
            done = []
            out = (work / 'prints.txt').read_text(encoding='latin-1') if (work / 'prints.txt').exists() else ''
            for line in out.split('\n'):
                if ' ' in line:
                    name, width = line.split(' ', 1)
                    done.append(name)
                    if name not in failed and width != '0.0pt':
                        printing.add(name)
            # A name that stops TeX writes nothing: it does not print, and the names after it run again.
            rest = rest[rest.index(done[-1]) + 1:] if done else rest[1:]
        return printing
    finally:
        shutil.rmtree(work, ignore_errors=True)


def prints(names: list[str]) -> set[str]:
    """The names that typeset something in math mode without an error."""
    chunks = [names[i:i + 25] for i in range(0, len(names), 25)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        return set().union(*pool.map(prints_chunk, chunks))


def generate() -> None:
    work = Path(tempfile.mkdtemp(prefix='lmcommands'))
    try:
        table = meanings(sorted(set(candidates()) | set(CURATED) | set(PRIMITIVES)), work)
        curated = [n for n in CURATED if n in table]
        symbols = sorted(n for n, m in table.items() if m.startswith('\\mathchar"') and n not in curated)
        macros = [n for n, m in table.items() if re.match(r'(\\protected )?macro:->', m)]
        composites = sorted(prints(sorted(macros)) - set(curated))
        primitives = [n for n in PRIMITIVES if table.get(n, '').strip() == '\\' + n]
        for name in sorted(set(CURATED) - set(curated)):
            print(f'not in this LaTeX, left out: \\{name}', file=sys.stderr)
        for name in sorted(set(PRIMITIVES) - set(primitives)):
            print(f'not a primitive in this LaTeX, left out: \\{name}', file=sys.stderr)

        defined = meanings([n for e in ENVIRONMENTS for n in (e, 'end' + e)], work)
        environments = [e for e in ENVIRONMENTS if e in defined and 'end' + e in defined]
        for name in sorted(set(ENVIRONMENTS) - set(environments)):
            print(f'not in this LaTeX, left out: environment {name}', file=sys.stderr)

        version = subprocess.run(['latex', '--version'], capture_output=True, text=True).stdout.split('\n')[0]
        commands = sorted(set(symbols) | set(composites) | set(curated) | set(primitives))

        def literal(names: list[str]) -> str:
            rows, row = [], ''
            for name in names:
                if len(row) + len(name) + 1 > 104:
                    rows.append(row)
                    row = ''
                row += (' ' if row else '') + name
            rows.append(row)
            return '\n'.join(f"  '{r} '," for r in rows)

        OUT.write_text(
            '// Written by tools/commands.py generate. Do not edit: change the lists in that file and run it again.\n'
            f'// Built from {version}.\n'
            f'// {len(symbols)} symbols, {len(composites)} composite symbols, {len(curated)} structural commands '
            f'and {len(primitives)} primitives.\n\n'
            "const words = (...rows: string[]) => new Set(rows.join('').trim().split(' '))\n\n"
            '/** The commands that a formula may use, without their backslash. */\n'
            'export const COMMANDS: ReadonlySet<string> = words(\n' + literal(commands) + '\n)\n\n'
            '/** The environments that a formula may use. */\n'
            'export const ENVIRONMENTS: ReadonlySet<string> = words(\n' + literal(environments) + '\n)\n')
        print(f'{OUT.relative_to(ROOT)}: {len(commands)} commands, {len(environments)} environments')
    finally:
        shutil.rmtree(work, ignore_errors=True)


# Probe.

def listed() -> tuple[list[str], list[str]]:
    blocks = re.findall(r'words\(\n(.*?)\n\)', OUT.read_text(), re.S)
    commands, environments = (''.join(re.findall(r"'([^']*)'", block)).split() for block in blocks)
    return commands, environments


NAMES = ['canaryx', 'input', '@input']


def command_shapes(name: str) -> list[str]:
    c = '\\' + name
    shapes = [c, c + '{FILE}', c + ' FILE\\relax ']
    for n in NAMES:
        shapes += [f'{c}{{{n}}}', f'{c}{{{n}}}{{FILE}}', f'{c}{{FILE}}{{{n}}}', f'{c}{{{n}}}{{{n}}}',
                   f'{c}{{{n}}}{{{n}}}{{FILE}}', f'{c}[{n}]{{FILE}}', f'{c}[FILE]{{{n}}}',
                   f'{c}[{n}]{{{n}}}{{FILE}}', f'{c}*{{{n}}}{{FILE}}']
    return shapes


def environment_shapes(name: str) -> list[str]:
    begin, end = f'\\begin{{{name}}}', f'\\end{{{name}}}'
    shapes = [f'{begin} x {end}', f'{begin}{{FILE}} x {end}']
    for n in NAMES:
        shapes += [f'{begin}{{{n}}}{{FILE}} x {end}', f'{begin}[{n}]{{FILE}} x {end}',
                   f'{begin}{{FILE}}{{{n}}} x {end}']
    return shapes


def harness(tests: list[tuple[int, str]]) -> str:
    lines = [preamble(), r'\begin{document}', r'\newwrite\probe', r'\immediate\openout\probe=probe.out',
             r'\def\canaryx{\immediate\write\probe{EXEC}}', r'\newcount\cc',
             r'\def\snapshot{\cc=0 \loop \expandafter\chardef\csname cat\the\cc\endcsname=\catcode\cc',
             r'  \advance\cc 1 \ifnum\cc<256 \repeat}',
             r'\def\compare{\cc=0 \loop \ifnum\catcode\cc=\csname cat\the\cc\endcsname\else',
             r'  \immediate\write\probe{DRIFT}\fi \advance\cc 1 \ifnum\cc<256 \repeat}',
             r'\snapshot', r'\scrollmode']
    for index, body in tests:
        lines += [r'\immediate\write\probe{BEGIN %d}' % index, body, r'\immediate\write\probe{DONE %d}' % index]
    lines += [r'\end{document}', '']
    return '\n'.join(lines)


def run_tests(tests: list[tuple[int, str]], work: Path, canary: Path, trees: list[str]) -> dict[int, set[str]]:
    """What each test showed: EXEC, FILE, READ, OTHER or DRIFT. A test that derails TeX runs again alone."""
    seen: dict[int, set[str]] = {}
    queue = [tests]
    while queue:
        batch = queue.pop()
        for stale in ('probe.out', 'f.fls'):
            (work / stale).unlink(missing_ok=True)
        latex(harness(batch), work, '-interaction=scrollmode', '-recorder', seconds=15)
        out = (work / 'probe.out').read_text(encoding='latin-1') if (work / 'probe.out').exists() else ''
        current, finished, found = None, set(), {index: set() for index, _ in batch}
        for line in out.split('\n'):
            if line.startswith('BEGIN '):
                current = int(line[6:])
            elif line.startswith('DONE '):
                finished.add(int(line[5:]))
                current = None
            elif line in ('EXEC', 'FILE', 'DRIFT') and current is not None:
                found[current].add(line)
        fls = (work / 'f.fls').read_text(encoding='latin-1') if (work / 'f.fls').exists() else ''
        reads = set()
        for path in re.findall(r'^INPUT (.+)$', fls, re.M):
            if path == str(canary):
                reads.add('READ')
            elif path.startswith('/') and not path.startswith(str(work)) and not any(path.startswith(t) for t in trees):
                reads.add('OTHER')  # a file that is neither LaTeX's own nor the test's
        if reads and len(batch) > 1:
            # The recorder does not say which test read the file, so each one runs alone.
            queue += [[test] for test in batch]
            continue
        for index, findings in found.items():
            seen.setdefault(index, set()).update(findings | reads)
        unfinished = [test for test in batch if test[0] not in finished]
        if unfinished and len(batch) > 1:
            queue += [[test] for test in unfinished]
    return seen


def probe_one(job: tuple[str, list[str], list[str]]) -> list[tuple[str, str, str]]:
    label, shapes, trees = job
    work = Path(tempfile.mkdtemp(prefix='lmprobe'))
    try:
        canary = work / 'canary.tex'
        canary.write_text('\\immediate\\write\\probe{FILE}\n')
        shapes = [shape.replace('FILE', str(canary)) for shape in shapes]
        tests = []
        for shape in shapes:
            # Six empty groups feed a command that wants more arguments, so it cannot eat \compare.
            tests.append((len(tests), r'\setbox0\vbox{$%s{}{}{}{}{}{}\compare$}' % shape))
            tests.append((len(tests), r'\setbox0\vbox{%s{}{}{}{}{}{}\compare}' % shape))
        seen = run_tests(tests, work, canary, trees)
        return [(label, finding, shapes[index // 2].replace(str(canary), 'FILE'))
                for index, findings in sorted(seen.items()) for finding in sorted(findings)]
    finally:
        shutil.rmtree(work, ignore_errors=True)


def probe(only: list[str]) -> int:
    commands, environments = listed()
    trees = [t.lstrip('!') for t in kpsewhich('-expand-path', '$TEXMF').split(os.pathsep) if t]
    # \begin and \end run the environment that they name: that is their purpose. The guard checks the name.
    jobs = [(f'\\{c}', command_shapes(c), trees) for c in commands if c not in ('begin', 'end')]
    jobs += [(f'environment {e}', environment_shapes(e), trees) for e in environments]
    if only:
        jobs = [job for job in jobs if job[0].lstrip('\\').replace('environment ', '') in only]
    controls = [(f'\\{c}', command_shapes(c), trees) for c in CONTROLS]
    with concurrent.futures.ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        control_findings = [f for found in pool.map(probe_one, controls) for f in found]
        findings = [f for found in pool.map(probe_one, jobs) for f in found]
    blind = [name for name, expect in CONTROLS.items()
             if not any(label == f'\\{name}' and finding == expect for label, finding, _ in control_findings)]
    if blind:
        print('the probe is broken: it saw nothing wrong with ' + ', '.join('\\' + b for b in blind), file=sys.stderr)
        return 2
    for label, finding, shape in findings:
        print(f'{finding:5} {label:28} {shape}')
    print(f'probed {len(jobs)} commands and environments: {len({f[0] for f in findings})} with findings')
    return 1 if findings else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=['generate', 'probe'])
    parser.add_argument('names', nargs='*', help='probe only these commands or environments')
    args = parser.parse_args()
    if args.action == 'generate':
        generate()
        return 0
    return probe(args.names)


if __name__ == '__main__':
    sys.exit(main())
