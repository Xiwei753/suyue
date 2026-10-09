#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""CI 签名注入（施工单 P1-7）。

把 Secrets 中的签名材料（JSON：base64 编码的
storeFile/certpath/profile + 别名/口令 + 双端
证书指纹）落盘到构建目录，并把真实
signingConfigs 写入 build-profile.json5，
同时把对端证书指纹注入身份配置文件。

绝不提交材料：所有写入都在工作区，
workflow 的清理步骤（if: always()）负责
git checkout 还原并删除目录。
"""
import argparse
import base64
import json
import os
import re
import sys

HEX64 = re.compile(r'^[0-9a-f]{64}$')


def fail(msg):
    print('ERROR: ' + msg, file=sys.stderr)
    sys.exit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--material-json', required=True,
                    help='SIGNING_MATERIAL 环境变量（JSON）')
    ap.add_argument('--signing-dir', required=True,
                    help='材料落盘目录（跨 step 持久）')
    ap.add_argument('--build-profile', required=True,
                    help='要写入 signingConfigs 的 build-profile.json5')
    ap.add_argument('--identity-file', required=True,
                    help='身份配置文件（注入对端指纹）')
    ap.add_argument('--identity-var', required=True,
                    help='身份文件中的指纹常量名')
    ap.add_argument('--fingerprint-key', required=True,
                    choices=['phone', 'watch'],
                    help='注入哪一个对端指纹')
    args = ap.parse_args()

    try:
        material = json.loads(args.material_json)
    except ValueError as exc:
        fail('SIGNING_MATERIAL 不是合法 JSON: %s' % exc)

    for field in ('storeFileB64', 'certpathB64',
                  'profileB64', 'keyAlias',
                  'keyPassword', 'storePassword'):
        if not material.get(field):
            fail('签名材料缺少字段: %s' % field)

    os.makedirs(args.signing_dir, exist_ok=True)
    files = {
        'storeFileB64': 'key.p12',
        'certpathB64': 'cert.cer',
        'profileB64': 'profile.p7b',
    }
    paths = {}
    for field, name in files.items():
        try:
            raw = base64.b64decode(material[field],
                                   validate=True)
        except Exception:
            fail('字段 %s 不是合法 base64' % field)
        if not raw:
            fail('字段 %s 解码后为空' % field)
        target = os.path.join(args.signing_dir, name)
        with open(target, 'wb') as handle:
            handle.write(raw)
        paths[field] = target

    # 真实 signingConfigs：替换空数组。
    sign_alg = material.get('signAlg',
                            'SHA256withECDSA')
    block = {
        'name': 'default',
        'type': 'HarmonyOS',
        'material': {
            'storeFile': paths['storeFileB64'],
            'certpath': paths['certpathB64'],
            'profile': paths['profileB64'],
            'signAlg': sign_alg,
            'storePassword': material['storePassword'],
            'keyAlias': material['keyAlias'],
            'keyPassword': material['keyPassword'],
        }
    }
    with open(args.build_profile, 'r',
              encoding='utf-8') as handle:
        profile_text = handle.read()
    if '"signingConfigs": []' not in profile_text:
        fail('build-profile.json5 中未找到 '
             '"signingConfigs": []')
    profile_text = profile_text.replace(
        '"signingConfigs": []',
        '"signingConfigs": ' + json.dumps([block]))
    with open(args.build_profile, 'w',
              encoding='utf-8') as handle:
        handle.write(profile_text)

    # 对端证书指纹注入身份配置。
    fingerprints = material.get('fingerprints') or {}
    fingerprint = str(
        fingerprints.get(args.fingerprint_key) or ''
    ).lower()
    if not HEX64.match(fingerprint):
        fail('fingerprints.%s 缺失或不是 64 位十六进制'
             % args.fingerprint_key)
    with open(args.identity_file, 'r',
              encoding='utf-8') as handle:
        identity_text = handle.read()
    pattern = ("export const %s = '';" %
               args.identity_var)
    if pattern not in identity_text:
        fail('身份文件中未找到 %s 的空占位' %
             args.identity_var)
    identity_text = identity_text.replace(
        pattern,
        'export const %s = \'%s\';' % (
            args.identity_var, fingerprint))
    with open(args.identity_file, 'w',
              encoding='utf-8') as handle:
        handle.write(identity_text)

    print('signing material staged at %s '
          '(content hidden); fingerprint %s injected'
          % (args.signing_dir,
             args.fingerprint_key))


if __name__ == '__main__':
    main()
