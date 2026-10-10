// SPDX-License-Identifier: GPL-3.0-only
// ZIP/source-contract tests, not actual signing or device installation.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Syntax checks are valuable here because signing is executed on the user's
// machine; a source-only CI job cannot sign without the private profile.
for (const script of ['tools/sign_hap.sh', 'tools/build_watch_lite.sh',
  'tests/build_artifact_check.sh']) {
  const r = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, script + ': ' + r.stderr);
}

// Prevent returning to outer-ZIP signing for Lite: HDEA discards that signature.
const signing = readFileSync('tools/sign_hap.sh', 'utf8');
const watchCI = readFileSync('.github/workflows/watch_lite_hap.yml', 'utf8');
assert.ok(signing.includes('IN_FORM="bin"'));
assert.ok(signing.includes('-inForm "$IN_FORM"'));
assert.ok(signing.includes('SIGN_TARGET="$LITE_TMP/unsigned.bin"'));
assert.ok(signing.includes('check_lite_bin.py'));
assert.ok(signing.includes('LITE_BIN_SIGNED_OK'));
assert.ok(watchCI.includes('-inForm bin'));
assert.ok(watchCI.includes('Verify actual delivered BIN signature'));

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
    '        if value.startswith("LITEBIN:"):',
    '            name_bytes = value.split(":", 1)[1].encode("utf-8")',
    '            value = bytes([0xbe]) + len(name_bytes).to_bytes(4, "big") + name_bytes + b"demo payload"',
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
  writeZip(signed, [['entry-default-unsigned.bin', 'LITEBIN:con.xiwei.suyue.gt4']]);
}

try {
  reset();
  const ok = check(['--source-manifest', source, '--expect-fingerprint', fingerprint]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /single_bin=1/);
  assert.match(ok.stdout, /manifest_origin=source-only/);

  writeZip(signed, [['entry-default-unsigned.bin', 'LITEBIN:com.example.myapplication']]);
  const templateHeader = check(['--source-manifest', source]);
  assert.notEqual(templateHeader.status, 0);
  assert.match(templateHeader.stderr, /actual BIN header bundleName/);
  reset();

  const missingSource = check();
  assert.notEqual(missingSource.status, 0);
  assert.match(missingSource.stderr, /requires a source config.json/);

  reset({ ...baseConfig, app: { bundleName: 'com.wrong.bundle' } });
  const mismatch = check(['--source-manifest', source]);
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /bundleName/);

  reset();
  writeZip(signed, [
    ['entry-default-unsigned.bin', 'LITEBIN:con.xiwei.suyue.gt4'],
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

  console.log('Lite single-bin artifact contract: OK (8 cases; signing and install untested)');
} finally {
  rmSync(root, { recursive: true, force: true });
}
