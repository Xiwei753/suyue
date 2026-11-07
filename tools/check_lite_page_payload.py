#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Inspect the page records physically stored in a Lite GT BIN/HAP."""
import argparse
import json
import struct
import sys
import zipfile


ROOT = "/assets/js/MainAbility"
PAGES_ROOT = ROOT + "/pages/"


def fail(message):
    print("LITE_PAGE_PAYLOAD_FAIL: " + message, file=sys.stderr)
    raise SystemExit(1)


def read_payload(args):
    if args.hap:
        try:
            with zipfile.ZipFile(args.hap) as archive:
                files = [item for item in archive.infolist() if not item.is_dir()]
                if (len(files) != 1 or not files[0].filename.endswith(".bin")
                        or "/" in files[0].filename or "\\" in files[0].filename):
                    fail("HAP must contain exactly one root .bin")
                return archive.read(files[0])
        except (OSError, zipfile.BadZipFile) as exc:
            fail("unable to read HAP: %s" % exc)
    try:
        with open(args.bin, "rb") as stream:
            return stream.read()
    except OSError as exc:
        fail("unable to read BIN: %s" % exc)


def records(data):
    """Yield valid Lite resource records (filename, directory, bytes)."""
    for offset in range(0, len(data) - 16):
        name_len = struct.unpack_from(">I", data, offset)[0]
        if not 1 <= name_len <= 255:
            continue
        name_start = offset + 4
        name_end = name_start + name_len
        if name_end + 4 > len(data):
            continue
        name_bytes = data[name_start:name_end]
        if b"/" in name_bytes or b"\\" in name_bytes:
            continue
        try:
            name = name_bytes.decode("utf-8")
        except UnicodeDecodeError:
            continue
        if not (name.endswith((".bc", ".js", ".js.map"))
                or name == "manifest.json"):
            continue
        directory_len = struct.unpack_from(">I", data, name_end)[0]
        if not 1 <= directory_len <= 512:
            continue
        directory_start = name_end + 4
        directory_end = directory_start + directory_len
        if directory_end + 8 > len(data):
            continue
        try:
            directory = data[directory_start:directory_end].decode("utf-8")
        except UnicodeDecodeError:
            continue
        if not (directory == ROOT or directory.startswith(PAGES_ROOT)):
            continue
        size = struct.unpack_from(">Q", data, directory_end)[0]
        content_start = directory_end + 8
        content_end = content_start + size
        if content_end > len(data):
            continue
        yield name, directory, data[content_start:content_end]


def one_entry(found, name, directory):
    matches = [content for candidate, path, content in found
               if candidate == name and path == directory]
    if len(matches) != 1:
        fail("expected one physical record for %s under %s, found %d" %
             (name, directory, len(matches)))
    return matches[0]


def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--bin")
    source.add_argument("--hap")
    parser.add_argument("--expected-page", action="append", default=[])
    parser.add_argument("--diagnostic-a", action="store_true")
    args = parser.parse_args()
    expected = args.expected_page
    if len(expected) != len(set(expected)):
        fail("duplicate --expected-page route")

    data = read_payload(args)
    found = list(records(data))
    manifest = one_entry(found, "manifest.json", ROOT)
    try:
        manifest_obj = json.loads(manifest.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail("packed manifest.json is invalid: %s" % exc)
    actual_manifest_pages = manifest_obj.get("pages")
    if actual_manifest_pages != expected:
        fail("packed manifest routes %r do not equal expected %r" %
             (actual_manifest_pages, expected))

    page_files = {}
    for name, directory, content in found:
        if not directory.startswith(PAGES_ROOT):
            continue
        route_dir = directory[len(ROOT) + 1:]
        if name.endswith(".js.map"):
            stem, extension = name[:-7], ".js.map"
        elif name.endswith(".bc"):
            stem, extension = name[:-3], ".bc"
        elif name.endswith(".js"):
            stem, extension = name[:-3], ".js"
        else:
            continue
        route = route_dir + "/" + stem
        page_files.setdefault(route, {})[extension] = content

    physical_pages = sorted(page_files)
    if physical_pages != sorted(expected):
        fail("physical page assets are %r, expected %r" %
             (physical_pages, sorted(expected)))
    required_extensions = {".js", ".js.map", ".bc"}
    for route in expected:
        extensions = set(page_files.get(route, {}))
        if extensions != required_extensions:
            fail("page %s has physical assets %r, expected %r" %
                 (route, sorted(extensions), sorted(required_extensions)))
    one_entry(found, "app.js", ROOT)
    one_entry(found, "app.js.map", ROOT)
    one_entry(found, "app.bc", ROOT)

    for route in expected:
        print("WATCH_BIN_PAGE_ENTRY=" + route)
    print("WATCH_BIN_PAGE_SET=" + ",".join(["app"] + expected))
    if args.diagnostic_a:
        if expected != ["pages/start/start"]:
            fail("--diagnostic-a requires exactly pages/start/start")
        start_js = page_files["pages/start/start"][".js"]
        if "A: 首屏已显示".encode("utf-8") not in start_js:
            fail("packed start.js does not contain the diagnostic A text")
        if b"@system.router" in start_js or b"router.replace" in start_js:
            fail("packed start.js still contains a router dependency")
        print("WATCH_DIAGNOSTIC_A_TEXT_PRESENT=yes")
        print("WATCH_DIAGNOSTIC_NO_ROUTER_IMPORT=yes")


if __name__ == "__main__":
    main()
