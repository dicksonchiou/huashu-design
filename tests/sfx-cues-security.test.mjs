import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('rejects executable Python syntax in a cue timestamp', () => {
  const dir = mkdtempSync(join(tmpdir(), 'huashu-sfx-cues-'));
  const marker = join(dir, 'injected');
  const table = join(dir, 'cues.tsv');
  const output = join(dir, 'output.mp4');
  const timestamp = `0')*1000));__import__('pathlib').Path('${marker}').write_text('owned');#`;

  try {
    writeFileSync(table, `${timestamp}\tui/click.mp3\t-12\n`);
    const result = spawnSync(
      'bash',
      [
        resolve('scripts/sfx-cues.sh'),
        resolve('assets/bgm-ad.mp3'),
        table,
        output,
        '--dur=1',
      ],
      { encoding: 'utf8' },
    );

    assert.notEqual(result.status, 0);
    assert.equal(existsSync(marker), false, result.stderr || result.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
