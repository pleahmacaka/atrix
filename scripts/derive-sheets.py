import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pymupdf

PT_PER_MM = 72 / 25.4
MARGIN = 20 * PT_PER_MM
NAMESPACES = {
    "": "http://www.w3.org/2000/svg",
    "xlink": "http://www.w3.org/1999/xlink",
    "inkscape": "http://www.inkscape.org/namespaces/inkscape",
}

SVG = "{http://www.w3.org/2000/svg}"
ANCHOR_SHIFT = {"start": 0, "middle": 0.5, "end": 1}

for prefix, uri in NAMESPACES.items():
    ET.register_namespace(prefix, uri)


def content(page: pymupdf.Page) -> pymupdf.Rect:
    box = pymupdf.Rect()

    for drawing in page.get_drawings():
        if drawing["rect"].width < page.rect.width * 0.9:
            box |= drawing["rect"]

    return (box + (-MARGIN, -MARGIN, MARGIN, MARGIN)) & page.rect


def resize(root: ET.Element, x: float, y: float, width: float, height: float) -> None:
    root.set("width", f"{width:.4f}mm")
    root.set("height", f"{height:.4f}mm")
    root.set("viewBox", f"{x:.4f} {y:.4f} {width:.4f} {height:.4f}")


def short(value: str) -> str:
    return f"{float(value):.3f}".rstrip("0").rstrip(".")


def label(text: ET.Element, transform: str) -> dict:
    width = float(text.get("textLength", "0"))
    height = float(text.get("font-size", "0"))
    shift = ANCHOR_SHIFT.get(text.get("text-anchor", "start"), 0)
    pad = height * 0.35

    return {
        "text": (text.text or "").strip(),
        "x": round(float(text.get("x", "0")) - width * shift - pad, 3),
        "y": round(float(text.get("y", "0")) - height - pad, 3),
        "width": round(width + pad * 2, 3),
        "height": round(height + pad * 2, 3),
        "transform": transform,
    }


def merged_strokes(group: ET.Element, chain: bool) -> str:
    d = []
    end = None

    for path in group.iter(f"{SVG}path"):
        values = [
            short(v)
            for v in path.get("d", "").replace("M", " ").replace("L", " ").split()
        ]
        points = list(zip(values[::2], values[1::2]))

        if not chain or points[0] != end:
            d.append(f"M{points[0][0]} {points[0][1]}")

        d.extend(f"L{x} {y}" for x, y in points[1:])
        end = points[-1]

    return "".join(d)


def optimize(root: ET.Element) -> list[dict]:
    parents = {child: parent for parent in root.iter() for child in parent}
    labels = []

    for text in root.findall(f".//{SVG}text"):
        holder = parents[text]
        transform = holder.get("transform", "") if holder.tag == f"{SVG}g" else ""

        if (text.text or "").strip():
            labels.append(label(text, transform))

        holder.remove(text)

    for group in root.findall(f".//{SVG}g[@class='stroked-text']"):
        holder = parents[group]
        style = holder.get("style", "")
        d = merged_strokes(group, "fill:none" in style and "linejoin:round" in style)
        holder[list(holder).index(group)] = ET.Element(f"{SVG}path", d=d)

    for meta in [*root.findall(f"{SVG}title"), *root.findall(f"{SVG}desc")]:
        root.remove(meta)

    for group in root.findall(f".//{SVG}g"):
        if len(group) == 0:
            parents[group].remove(group)

    return labels


def crop_svg(path: Path) -> None:
    x0, y0, x1, y1 = (v / PT_PER_MM for v in content(pymupdf.open(path)[0]))
    tree = ET.parse(path)
    root = tree.getroot()
    resize(root, x0, y0, x1 - x0, y1 - y0)
    labels = optimize(root)
    tree.write(path, encoding="utf-8", xml_declaration=True)
    origin = {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}
    sheet = {"origin": {k: round(v, 4) for k, v in origin.items()}, "labels": labels}
    path.with_suffix(".json").write_text(
        json.dumps(sheet, separators=(",", ":")), encoding="utf-8"
    )


def crop_pdf(source: Path, target: Path) -> None:
    doc = pymupdf.open(source)

    for page in doc:
        page.set_cropbox(content(page))

    doc.save(target, garbage=4, deflate=True)


def demo() -> None:
    root = ET.fromstring(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="5mm" viewBox="0 0 10 5"><rect/></svg>'
    )
    resize(root, 1, 2, 3, 4)
    assert ET.tostring(root, encoding="unicode") == (
        '<svg xmlns="http://www.w3.org/2000/svg" width="3.0000mm" height="4.0000mm" viewBox="1.0000 2.0000 3.0000 4.0000"><rect /></svg>'
    )

    sheet = ET.fromstring(
        '<svg xmlns="http://www.w3.org/2000/svg"><title>t</title><g style="fill:none; stroke-linejoin:round;">'
        '<g transform="rotate(-90 1 2)"><text x="1" y="2" textLength="2" font-size="1" text-anchor="middle">R1</text></g>'
        '<g class="stroked-text"><desc>R1</desc><path d="M0.12341 0 L1 1 " /><path d="M1 1 L2 0 " /><path d="M5 5 L6 6 " /></g>'
        "</g></svg>"
    )
    assert optimize(sheet) == [
        {
            "text": "R1",
            "x": -0.35,
            "y": 0.65,
            "width": 2.7,
            "height": 1.7,
            "transform": "rotate(-90 1 2)",
        }
    ]
    assert ET.tostring(sheet, encoding="unicode") == (
        '<svg xmlns="http://www.w3.org/2000/svg"><g style="fill:none; stroke-linejoin:round;">'
        '<path d="M0.123 0L1 1L2 0M5 5L6 6" /></g></svg>'
    )


if __name__ == "__main__":
    demo()
    command, *paths = sys.argv[1:]

    if command == "crop-svg":
        for p in paths:
            crop_svg(Path(p))
    elif command == "crop-pdf":
        crop_pdf(Path(paths[0]), Path(paths[1]))
