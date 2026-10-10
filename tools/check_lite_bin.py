#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Check the actual GT Lite .bin header identity, not just source config.json.

OpenHarmony Lite GtExtractorUtil::ExtractFileHeaderInfo consumes:
  magic byte 0xBE, bundle-name length as big-endian uint32, bundle-name bytes.
HDEA sends this .bin to the watch. A stale template identity in this header
cannot be fixed by checking only the source manifest.
"""
import argparse
import struct
import sys
import zipfile


def fail(message):
    print("LITE_BIN_IDENTITY_FAIL: " + message, file=sys.stderr)
    sys.exit(1)


def read_bin(args):
    if args.hap:
        with zipfile.ZipFile(args.hap) as archive:
            files = archive.infolist()
            if (len(files) != 1 or not files[0].filename.endswith(".bin")
                    or files[0].is_dir() or "/" in files[0].filename
                    or "\\" in files[0].filename):
                fail("HAP must contain exactly one root .bin")
            return archive.read(files[0])
    with open(args.bin, "rb") as stream:
        return stream.read()


def main():
    ap = argparse.ArgumentParser()
    source = ap.add_mutually_exclusive_group(required=True)
    source.add_argument("--hap")
    source.add_argument("--bin")
    ap.add_argument("--bundle", required=True)
    args = ap.parse_args()

    try:
        data = read_bin(args)
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        fail("unable to read BIN: %s" % exc)
    if len(data) < 6:
        fail("truncated BIN header")
    if data[0] != 0xBE:
        fail("BIN magic 0x%02x is not the expected Lite GT format (0xBE)" %
             data[0])
    name_len = struct.unpack(">I", data[1:5])[0]
    if not 7 <= name_len <= 256 or 5 + name_len > len(data):
        fail("BIN header bundle-name length is invalid: %s" % name_len)
    try:
        name = data[5:5 + name_len].decode("utf-8")
    except UnicodeDecodeError:
        fail("BIN header bundle name is not valid UTF-8")
    if name != args.bundle:
        fail("actual BIN header bundleName=%r, expected=%r" %
             (name, args.bundle))
    if b"com.example.myapplication" in data and args.bundle != "com.example.myapplication":
        fail("compiled BIN still contains com.example.myapplication template identity")
    print("LITE_BIN_IDENTITY_OK: header bundleName=%s size=%d" %
          (name, len(data)))


if __name__ == "__main__":
    main()
