#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Require the startup diagnostic text to have visibly nonzero styling."""
import argparse
import re
import sys
from pathlib import Path


def fail(message):
    print("LITE_DIAGNOSTIC_UI_FAIL: " + message, file=sys.stderr)
    raise SystemExit(1)


def declarations(css, selector):
    rules = re.findall(r"([^{}]+)\{([^{}]*)\}", css, flags=re.S)
    matches = [body for head, body in rules
               if selector in {item.strip() for item in head.split(",")}]
    if len(matches) != 1:
        fail("expected exactly one CSS rule for %s, found %d" %
             (selector, len(matches)))
    result = {}
    for item in matches[0].split(";"):
        if ":" not in item:
            continue
        key, value = item.split(":", 1)
        result[key.strip().lower()] = value.strip().lower()
    return result


def require_nonzero_length(values, name, selector):
    value = values.get(name, "")
    match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)(?:px|vp|%)?", value)
    if not match or float(match.group(1)) <= 0:
        fail("%s.%s must have an explicit nonzero length" % (selector, name))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hml", required=True)
    parser.add_argument("--css", required=True)
    args = parser.parse_args()
    try:
        hml = Path(args.hml).read_text(encoding="utf-8")
        css = Path(args.css).read_text(encoding="utf-8")
    except OSError as exc:
        fail("cannot read diagnostic UI source: %s" % exc)

    if not re.search(r"<text\b[^>]*class=[\"']status[\"'][^>]*>\s*\{\{\s*status\s*\}\}", hml):
        fail("HML must render the status binding inside class=\"status\"")

    screen = declarations(css, ".screen")
    status = declarations(css, ".status")
    require_nonzero_length(screen, "width", ".screen")
    require_nonzero_length(screen, "height", ".screen")
    require_nonzero_length(status, "width", ".status")
    require_nonzero_length(status, "height", ".status")
    require_nonzero_length(status, "font-size", ".status")

    background = screen.get("background-color", "")
    if not background or background in {"black", "#000", "#000000", "#000000ff", "transparent"}:
        fail(".screen needs an explicit visible non-black background-color")
    color = status.get("color", "")
    if not color or color in {"black", "#000", "#000000", "#000000ff", "transparent"}:
        fail(".status needs an explicit contrasting non-black text color")
    if screen.get("justify-content") != "center" or screen.get("align-items") != "center":
        fail(".screen must center the visible diagnostic text")

    print("WATCH_DIAGNOSTIC_UI_STATIC_OK=yes")
    print("WATCH_DIAGNOSTIC_TEXT_BOX=240x80px font-size=22px")
    print("WATCH_DIAGNOSTIC_UI_COLORS=explicit-background-and-text")


if __name__ == "__main__":
    main()
