#!/usr/bin/env python3
"""Build OathboundIcons.ttf: the logo and the seven subagent icons as monochrome glyphs.

Offline tool, not part of the plugin or its tests. Requires: fonttools, skia-pathops.
Usage: python build-glyph-font.py [output-dir]   (default: this directory)
Shapes mirror assets/logo.svg and assets/readme-agents.svg (foreground only, no tile).
"""
import math
import sys
from pathlib import Path

import pathops
from pathops import LineCap, LineJoin, Path as PPath, PathOp
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path

UPM = 1000
ADVANCE = 600
BOX = 580  # glyph square, centred in the advance
BASE = -30  # bottom of the square relative to the baseline

# Private Use Area slot not used by Nerd Fonts, Powerline, Codicons or Font Awesome.
GLYPHS = [
    ("oathbound", 0xEF00),
    ("scout", 0xEF01),
    ("scholar", 0xEF02),
    ("scribe", 0xEF03),
    ("smith", 0xEF04),
    ("assayer", 0xEF05),
    ("sentinel", 0xEF06),
    ("breaker", 0xEF07),
]


def svg_path(d):
    p = PPath()
    parse_path(d, p.getPen())
    return p


def circle(cx, cy, r):
    k = 0.5522847498 * r
    p = PPath()
    pen = p.getPen()
    pen.moveTo((cx + r, cy))
    pen.curveTo((cx + r, cy + k), (cx + k, cy + r), (cx, cy + r))
    pen.curveTo((cx - k, cy + r), (cx - r, cy + k), (cx - r, cy))
    pen.curveTo((cx - r, cy - k), (cx - k, cy - r), (cx, cy - r))
    pen.curveTo((cx + k, cy - r), (cx + r, cy - k), (cx + r, cy))
    pen.closePath()
    return p


def rect(x, y, w, h):
    return svg_path(f"M{x} {y}H{x + w}V{y + h}H{x}Z")


def ellipse_rot(cx, cy, rx, ry, deg):
    p = circle(0, 0, 1)
    p = p.transform(rx, 0, 0, ry, 0, 0)
    a = math.radians(deg)
    p = p.transform(math.cos(a), math.sin(a), -math.sin(a), math.cos(a), cx, cy)
    return p


def stroked(p, width, cap=LineCap.BUTT_CAP, join=LineJoin.MITER_JOIN):
    p.stroke(width, cap, join, 4)
    p.convertConicsToQuads()
    return p


def union(*ps):
    out = PPath()
    for p in ps:
        out = pathops.op(out, p, PathOp.UNION, fix_winding=True)
    return out


def sub(a, *bs):
    for b in bs:
        a = pathops.op(a, b, PathOp.DIFFERENCE, fix_winding=True)
    return a


def line(x1, y1, x2, y2):
    return svg_path(f"M{x1} {y1}L{x2} {y2}")


# Each builder returns (path, (x0, y0, x1, y1)) in SVG user units, y down.

def g_oathbound():
    vline = stroked(svg_path("M22 8V56"), 5)
    cut_line = stroked(svg_path("M26.68 45.94A14 14 0 0 1 18.03 41.83"), 9)
    ring = stroked(circle(28, 32, 14), 5)
    cut_circle = stroked(svg_path("M22 13.5V25.2"), 9)
    dots = union(circle(22, 8, 5.5), circle(22, 56, 5.5), circle(42, 32, 5.5))
    return union(sub(vline, cut_line), sub(ring, cut_circle), dots), (14.5, 2.5, 47.5, 61.5)


def g_scout():
    ring = stroked(circle(32, 32, 16), 3)
    needle = svg_path("m39 23-3 13-11 5 3-13z")
    needle_edge = stroked(svg_path("m39 23-3 13-11 5 3-13z"), 3, join=LineJoin.ROUND_JOIN)
    return union(ring, needle, needle_edge), (14.5, 14.5, 49.5, 49.5)


def g_scholar():
    book = rect(19, 14, 26, 36)
    spine = stroked(svg_path("M24.5 14V50"), 2.5)
    mark = svg_path("M34 14V31L37.5 27.5L41 31V14Z")
    return sub(book, spine, mark), (19, 14, 45, 50)


def g_scribe():
    body = union(
        svg_path("M19 35H39A2 2 0 0 1 41 37V48A2 2 0 0 1 39 50H19A2 2 0 0 1 17 48V37A2 2 0 0 1 19 35Z"),
        rect(23, 29, 12, 7),
        svg_path("M22 26.5H36A1 1 0 0 1 37 27.5V29.5A0.5 0.5 0 0 1 36.5 30H21.5A0.5 0.5 0 0 1 21 29.5V27.5A1 1 0 0 1 22 26.5Z"),
    )
    feather = ellipse_rot(42, 17, 4.5, 10, 34)
    cream = union(body, feather)
    cream = sub(cream, stroked(line(36.5, 25, 46.5, 10), 1.6, LineCap.ROUND_CAP))
    cream = union(cream, stroked(line(36.6, 24.8, 32, 31), 2.5, LineCap.ROUND_CAP))
    cream = sub(cream, stroked(line(21, 40, 37, 40), 2))
    return cream, (17, 7, 47.5, 50)


def g_smith():
    return svg_path("M14 22H48C48 29 44 32 39 32V38H45V45H19V38H25V32C20 32 16 28 14 22Z"), (14, 22, 48, 45)


def g_assayer():
    disc = circle(32, 32, 16)
    rays = stroked(
        svg_path(
            "M45.20 32.00L49.00 32.00M41.33 41.33L44.02 44.02M32.00 45.20L32.00 49.00"
            "M22.67 41.33L19.98 44.02M18.80 32.00L15.00 32.00M22.67 22.67L19.98 19.98"
            "M32.00 18.80L32.00 15.00M41.33 22.67L44.02 19.98"
        ),
        2.2,
    )
    cream = sub(disc, rays, circle(32, 32, 9))
    cream = union(cream, stroked(svg_path("M26.5 31A6 6 0 0 1 31 26.5"), 2.2, LineCap.ROUND_CAP))
    return cream, (16, 16, 48, 48)


def g_sentinel():
    shield = stroked(svg_path("M32 15l13 5v11c0 8-6 14-13 18-7-4-13-10-13-18V20z"), 3, LineCap.ROUND_CAP, LineJoin.ROUND_JOIN)
    check = stroked(svg_path("m26 32 4 4 8-9"), 3, LineCap.ROUND_CAP, LineJoin.ROUND_JOIN)
    return union(shield, check), (17.5, 13.5, 46.5, 50.5)


def g_breaker():
    body = svg_path("M13 43L20 23H44L51 43Z")
    crack = stroked(svg_path("M34 20L29 30L36 35L31 46"), 3.5, join=LineJoin.BEVEL_JOIN)
    return sub(body, crack), (13, 20, 51, 46)


BUILDERS = {
    "oathbound": g_oathbound, "scout": g_scout, "scholar": g_scholar, "scribe": g_scribe,
    "smith": g_smith, "assayer": g_assayer, "sentinel": g_sentinel, "breaker": g_breaker,
}


def to_glyph(path, bounds):
    x0, y0, x1, y1 = bounds
    # Fit the shape's bounds in the square, keeping aspect ratio; flip y (SVG down -> font up).
    scale = BOX / max(x1 - x0, y1 - y0)
    w, h = (x1 - x0) * scale, (y1 - y0) * scale
    ox = (ADVANCE - w) / 2
    oy = BASE + (BOX - h) / 2
    p = PPath(path)
    p.simplify(fix_winding=True)
    p = p.transform(scale, 0, 0, -scale, ox - x0 * scale, oy + y1 * scale)
    pen = TTGlyphPen(None)
    p.draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
    return pen.glyph()


def main():
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent
    out_dir.mkdir(parents=True, exist_ok=True)
    glyphs = {".notdef": TTGlyphPen(None).glyph(), "space": TTGlyphPen(None).glyph()}
    for name, _ in GLYPHS:
        path, bounds = BUILDERS[name]()
        glyphs[name] = to_glyph(path, bounds)
    order = [".notdef", "space"] + [n for n, _ in GLYPHS]
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({0x20: "space", **{cp: n for n, cp in GLYPHS}})
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({n: (ADVANCE, 0) for n in order})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "Oathbound Icons", "styleName": "Regular",
                       "copyright": "Oathbound", "version": "Version 1.000"})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupPost(isFixedPitch=1)
    fb.save(str(out_dir / "OathboundIcons.ttf"))
    print(out_dir / "OathboundIcons.ttf")


if __name__ == "__main__":
    main()
