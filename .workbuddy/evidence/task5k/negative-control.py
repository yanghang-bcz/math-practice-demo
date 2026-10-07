#!/usr/bin/env python3
"""反向对照：分别撤销两处修复，确认新加的回归测试真的会红。

流程：备份 -> 打补丁 -> 跑指定测试 -> 还原。任何一步失败都要还原。
"""
import subprocess, sys, shutil, pathlib

ROOT = pathlib.Path('/Users/emobcccz/Documents/GitHub/math-practice-demo')
ENGINE = ROOT / 'math-quality.js'
BACKUP = ROOT / '.workbuddy/tmp/math-quality.backup.js'
NODE = '/Users/emobcccz/.workbuddy/binaries/node/versions/22.22.2-3/bin/node'

FIXED = ENGINE.read_text()
shutil.copy2(ENGINE, BACKUP)

NEW_TESTS = 'tests/math-engine.cjs'
CORPUS_TESTS = 'tests/wrong-canonical.cjs'

def run(tests):
    r = subprocess.run([NODE, '--test', tests], cwd=ROOT, capture_output=True, text=True)
    tail = [l for l in r.stdout.splitlines() if l.startswith('# pass') or l.startswith('# fail')]
    return r.returncode, tail

def patch(name, old, new):
    assert old in FIXED, f'[{name}] 找不到要替换的锚点'
    ENGINE.write_text(FIXED.replace(old, new, 1))
    print(f'\n=== 反向对照：{name} 已撤销 ===')

def restore():
    shutil.copy2(BACKUP, ENGINE)
    assert ENGINE.read_text() == FIXED, '还原失败！'

try:
    # ---- 对照 A：撤销闸门策略（回到 Tier B 被当 VERIFIED 的老逻辑）----
    patch(
        'A｜闸门策略',
        """  function gateStateFromProfile(profile) {
    if (!profile || !profile.readable) return GATE.UNCERTAIN;

    if (profile.verdict === 'equivalent') return GATE.VERIFIED;
    if (profile.verdict === 'not_equivalent') return GATE.REJECTED;

    return GATE.UNCERTAIN;
  }""",
        """  function gateStateFromProfile(profile) {
    if (!profile || !profile.readable) return GATE.UNCERTAIN;
    return profile.tier === TIER.C ? GATE.UNCERTAIN : GATE.VERIFIED;
  }""",
    )
    rc, tail = run(NEW_TESTS)
    print('  node --test tests/math-engine.cjs ->', '退出码', rc, tail)
    restore()

    # ---- 对照 B：撤销方括号解析（回到 [ ] 无法解析）----
    patch(
        'B｜方括号解析',
        "    t = t.replace(/\\[/g, '(').replace(/\\]/g, ')');\n",
        "",
    )
    rc, tail = run(NEW_TESTS)
    print('  node --test tests/math-engine.cjs ->', '退出码', rc, tail)
    rc2, tail2 = run(CORPUS_TESTS)
    print('  node --test tests/wrong-canonical.cjs ->', '退出码', rc2, tail2)
    restore()

    print('\n✓ 引擎已还原，与修复版逐字节一致')
finally:
    restore()
    # ★ 备份必须删掉：留一份"看起来像引擎"的旧副本在这里，
    #   下次谁 cp 错了就会把修复悄悄退回去。
    BACKUP.unlink(missing_ok=True)
    print('（finally 确认已还原，备份已清理）')
