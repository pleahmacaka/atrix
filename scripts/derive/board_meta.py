import json
import sys
from collections import Counter

import pcbnew


def supplier_part(fp: pcbnew.FOOTPRINT) -> str:
    fields = {f.GetName(): f.GetText() for f in fp.GetFields()}

    return fields.get("Supplier Part Number", "").split(",")[0].strip()


def meta(path: str) -> dict:
    board = pcbnew.LoadBoard(path)
    box = board.GetBoardEdgesBoundingBox()
    settings = board.GetDesignSettings()
    tracks = [t for t in board.GetTracks() if t.GetClass() == "PCB_TRACK"]
    parts = Counter()
    values = {}

    for fp in board.GetFootprints():
        code = supplier_part(fp)

        if code:
            parts[code] += 1
            values[code] = fp.GetValue()

    return {
        "width": round(pcbnew.ToMM(box.GetWidth()), 2),
        "height": round(pcbnew.ToMM(box.GetHeight()), 2),
        "originX": round(pcbnew.ToMM(box.GetX()), 3),
        "originY": round(pcbnew.ToMM(box.GetY()), 3),
        "thickness": round(pcbnew.ToMM(settings.GetBoardThickness()), 2),
        "copperLayers": board.GetCopperLayerCount(),
        "tracks": len(tracks),
        "trackLength": round(sum(pcbnew.ToMM(t.GetLength()) for t in tracks), 1),
        "vias": sum(1 for t in board.GetTracks() if t.GetClass() == "PCB_VIA"),
        "footprints": len(board.GetFootprints()),
        "nets": board.GetNetCount(),
        "parts": [{"lcsc": c, "qty": q, "value": values[c]} for c, q in sorted(parts.items())],
    }


if __name__ == "__main__":
    print(json.dumps(meta(sys.argv[1]), ensure_ascii=False))
