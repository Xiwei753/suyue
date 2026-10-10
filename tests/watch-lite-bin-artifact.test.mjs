// SPDX-License-Identifier: GPL-3.0-only
// ZIP/source-contract tests, not actual signing or device installation.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'suyue-lite-bin-'));
const signed = join(root, 'entry-default-debug-signed.hap');
const source = join(root, 'config.json');
const fingerprint = 'ab12cd34ef56';
const baseConfig = {
  app: { bundleName: 'con.xiwei.suyue.gt4' },
  module: {
    deviceType: ['liteWearable'],
    metaData: { customizeData: [{ name: 'supportLists',
      value: 'com.xiwei.suyue:' + fingerprint }] }
  }
};

function writeZip(target, entries) {
  const script = [
    'import json, sys, zipfile',
    "with zipfile.ZipFile(sys.argv[1], 'w', compression=zipfile.ZIP_DEFLATED) as z:",
    '    for name, value in json.loads(sys.argv[2]):',
    '        z.writestr(name, value)'
  ].join('\n');
  const result = spawnSync('python3', ['-c', script, target, JSON.stringify(entries)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
function check(extra = []) {
  return spawnSync('bash', ['tests/build_artifact_check.sh', signed,
    '--device', 'liteWearable', '--bundle', 'con.xiwei.suyue.gt4',
    '--mode', 'debug', ...extra], { encoding: 'utf8' });
}
function reset(config = baseConfig) {
  writeFileSync(source, JSON.stringify(config));
  writeZip(signed, [['entry-default-unsigned.bin', 'sample Lite payload']]);
}

try {
  reset();
  const ok = check(['--source-manifest', source, '--expect-fingerprint', fingerprint]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /single_bin=1/);
  assert.match(ok.stdout, /manifest_origin=source-only/);

  const missingSource = check();
  assert.notEqual(missingSource.status, 0);
  assert.match(missingSource.stderr, /requires a source config.json/);

  reset({ ...baseConfig, app: { bundleName: 'com.wrong.bundle' } });
  const mismatch = check(['--source-manifest', source]);
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /bundleName/);

  reset();
  writeZip(signed, [
    ['entry-default-unsigned.bin', 'sample Lite payload'],
    ['unexpected.txt', 'must not be accepted']
  ]);
  const extraFile = check(['--source-manifest', source]);
  assert.notEqual(extraFile.status, 0, 'A two-file ZIP must not be accepted as Lite single-bin');

  reset();
  const missingFingerprint = check(['--source-manifest', source,
    '--expect-fingerprint', 'ffff0000']);
  assert.notEqual(missingFingerprint.status, 0);
  assert.match(missingFingerprint.stderr, /fingerprint/);

  // Old multi-file HAP still requires an embedded manifest and .bc snapshots.
  writeZip(signed, [
    ['config.json', JSON.stringify(baseConfig)],
    ['pages/index/index.js', 'export default {}'],
    ['pages/index/index.bc', 'compiled snapshot placeholder']
  ]);
  const oldFormat = check(['--expect-fingerprint', fingerprint]);
  assert.equal(oldFormat.status, 0, oldFormat.stderr);
  assert.match(oldFormat.stdout, /single_bin=0/);

  writeZip(signed, [
    ['config.json', JSON.stringify(baseConfig)],
    ['pages/index/index.js', 'export default {}']
  ]);
  const badSnapshot = check();
  assert.notEqual(badSnapshot.status, 0);
  assert.match(badSnapshot.stderr, /missing JerryScript snapshots/);

  console.log('Lite single-bin artifact contract: OK (7 cases; signing and install untested)');
} finally {
  rmSync(root, { recursive: true, force: true });
}
