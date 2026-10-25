"""Real global Pi, real PTY keys, real provider requests. No runtime downloads."""
import json
import os
from pathlib import Path
import pty
import select
import shutil
import struct
import subprocess
import tempfile
import time
import fcntl
import termios

ROOT = Path(__file__).resolve().parent.parent
runtime = os.environ.get('PI_EVERGREEN_PI_BIN')
assert runtime and Path(runtime).is_file(), 'PI_EVERGREEN_PI_BIN must name the installed global Pi executable'
work = Path(tempfile.mkdtemp(prefix='.e2e-', dir=ROOT))
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 32, 120, 0, 0))
env = dict(os.environ, SNIPPET_TEST_DIR=str(work), TERM='xterm-256color')
body1 = 'SNIPPET_FIRST ${1:-literal $2}\nReply only OK.'
body2 = 'SNIPPET_RELOADED ${@:-literal $@}\nReply only OK.'
prompt = work / 'evergreen.md'
prompt.write_text('---\ndescription: hidden frontmatter sentinel\n---\n' + body1)
args = [runtime, '--no-extensions', '-e', str(ROOT / 'tests/e2e-observer.ts'),
        '-e', str(ROOT / 'extensions/prompt-snippets.ts'), '--no-skills', '--no-prompt-templates',
        '--no-context-files', '--no-mcp', '--no-tools', '--offline', '--no-approve',
        '--tui-mode', 'regular', '--session-dir', str(work / 'sessions'),
        '--provider', os.environ.get('PI_EVERGREEN_E2E_PROVIDER', 'openai'),
        '--model', os.environ.get('PI_EVERGREEN_E2E_MODEL', 'gpt-6-luna'),
        '--thinking', os.environ.get('PI_EVERGREEN_E2E_REASONING', 'medium'),
        '--system-prompt', 'Answer OK. Do not use tools.']
proc = subprocess.Popen(args, cwd=ROOT, env=env, stdin=slave, stdout=slave, stderr=slave)
os.close(slave)
output = bytearray()
def events():
    path = work / 'events.jsonl'
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
def wait(predicate, label, timeout=120):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if select.select([master], [], [], .05)[0]:
            try:
                output.extend(os.read(master, 65536))
            except OSError:
                pass
        if predicate(events()):
            return
        assert proc.poll() is None, f'Pi exited while waiting for {label}: {output[-3000:]!r}'
    raise AssertionError(f'timeout: {label}; terminal tail {output[-3000:]!r}')
def send(text):
    os.write(master, text.encode())
def count(kind):
    return sum(e['type'] == kind for e in events())
def draft(text):
    start = len(events())
    send(text)
    return start
def expect_draft(start, expected):
    wait(lambda es: any(e['type'] == 'draft' and e['value'] == expected for e in es[start:]), 'draft ' + repr(expected), 15)
def expand(expected):
    start = draft('Before snipet:ever')
    expect_draft(start, 'Before snipet:ever')
    start = draft('\t')
    expect_draft(start, 'Before snipet:evergreen')
    start = draft('\t')
    expect_draft(start, expected)
try:
    wait(lambda es: any(e['type'] == 'ready' for e in es), 'startup')
    # A loaded path can disappear before its first Tab; failed reads must leave drafts alone.
    original = prompt.read_text()
    prompt.unlink()
    start = draft('snipet:evergreen')
    expect_draft(start, 'snipet:evergreen')
    start = draft('\t')
    expect_draft(start, 'snipet:evergreen')
    assert b'Snippet snipet:evergreen unavailable' in output, 'missing file must warn'
    prompt.write_text(original)
    start = draft('\t')
    expect_draft(start, 'snipet:evergreen')  # Failed reads, like successful reads, are cached.
    assert count('request') == 0
    send('\x03')
    ready = count('ready')
    send('/reload\r')
    wait(lambda es: sum(e['type'] == 'ready' for e in es) > ready, 'reload after failed read')
    # Resource discovery happens after session_start; the wrapper must see it on Tab.
    expected1 = 'Before SNIPPET_FIRST literal $2\nReply only OK.'
    enters = count('enter')
    expand(expected1)
    assert count('request') == 0 and count('enter') == enters, 'Tab must not submit, including through a prior editor'
    send('\r')
    wait(lambda es: any(e['type'] == 'settled' for e in es), 'first live model turn')
    assert count('request') >= 1 and count('response') >= 1, 'observer must see actual transport activity'
    prompt.write_text('---\ndescription: hidden frontmatter sentinel\n---\n' + body2)
    expand(expected1)  # Cached until reload, even when the file changes.
    send('\x03')
    ready = count('ready')
    start = draft('/reload\r')
    wait(lambda es: sum(e['type'] == 'ready' for e in es) > ready, 'reload')
    expected2 = 'Before SNIPPET_RELOADED literal $@\nReply only OK.'
    expand(expected2)
    settled = count('settled')
    send('\r')
    wait(lambda es: sum(e['type'] == 'settled' for e in es) > settled, 'second live model turn')
    statuses = [e['value'] for e in events() if e['type'] == 'response']
    assert statuses and all(200 <= status < 300 for status in statuses), 'live transport must succeed'
    entries = [e['value'] for e in events() if e['type'] == 'settled'][-1]
    assistants = [e['message'] for e in entries if e.get('type') == 'message' and e.get('message', {}).get('role') == 'assistant']
    assert len(assistants) >= 2 and all(m.get('stopReason') not in ('error', 'aborted') for m in assistants), 'both live model turns must complete successfully'
    requests = [json.dumps(e['value']) for e in events() if e['type'] == 'request']
    assert 'SNIPPET_FIRST literal $2' in requests[0]
    assert 'SNIPPET_RELOADED literal $@' in requests[-1]
    assert 'SNIPPET_FIRST literal $2' in requests[-1], 'second request must include real conversation history'
    assert all('snipet:ever' not in r and 'hidden frontmatter sentinel' not in r for r in requests)
    # Negative controls prove the assertions discriminate unexpanded drafts and metadata leaks.
    def clean(r):
        return 'snipet:ever' not in r and 'hidden frontmatter sentinel' not in r
    assert not clean(requests[-1] + 'snipet:evergreen')
    assert not clean(requests[-1] + 'hidden frontmatter sentinel')
    artifacts = '\n'.join(p.read_text() for p in (work / 'sessions').rglob('*.jsonl'))
    assert expected1.replace('\n', '\\n') in artifacts and expected2.replace('\n', '\\n') in artifacts
    assert 'snipet:evergreen' not in artifacts
    # New session rebuilds the editor and registry; no provider call is needed.
    ready = count('ready')
    send('/new\r')
    wait(lambda es: sum(e['type'] == 'ready' for e in es) > ready, 'new session')
    expand(expected2)
    mode = 'default editor' if env.get('SNIPPET_TEST_DEFAULT_EDITOR') == '1' else 'prior submission wrapper'
    print(f'PASS global Pi ({mode}): read failures, discovery, two provider turns, cache/reload, artifacts, /new')
finally:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    os.close(master)
    shutil.rmtree(work)
