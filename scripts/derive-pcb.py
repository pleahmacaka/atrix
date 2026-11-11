import json
import sys

import pcbnew


def mm(value: int) -> float:
    return round(pcbnew.ToMM(value), 4)


def field(fp, name: str) -> str:
    texts = {str(f.GetName()): str(f.GetText()) for f in fp.GetFields()}

    return texts.get(name, "")


def footprint(fp) -> dict:
    return {
        "ref": str(fp.GetReference()),
        "value": str(fp.GetValue()),
        "footprint": str(fp.GetFPID().GetLibItemName()),
        "lcsc": field(fp, "Supplier Part Number"),
        "mpn": field(fp, "MPN"),
        "side": "bottom" if fp.GetLayer() == pcbnew.B_Cu else "top",
        "at": [mm(fp.GetPosition().x), mm(fp.GetPosition().y)],
        "bom": not (fp.IsExcludedFromBOM() or fp.IsDNP()),
        "pads": [
            {"number": str(p.GetNumber()), "net": str(p.GetNetname())}
            for p in fp.Pads()
            if p.GetNetname()
        ],
    }


def holes(footprints) -> list[dict]:
    return [
        {"at": [mm(p.GetPosition().x), mm(p.GetPosition().y)], "diameter": mm(p.GetDrillSize().x)}
        for fp in footprints
        for p in fp.Pads()
        if p.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH and fp.IsBoardOnly()
    ]


def ring(chain) -> list[list[float]]:
    return [[mm(p.x), mm(p.y)] for p in (chain.CPoint(i) for i in range(chain.PointCount()))]


def outline(board) -> list[list[list[float]]]:
    shapes = pcbnew.SHAPE_POLY_SET()
    board.GetBoardPolygonOutlines(shapes, True)

    return [
        ring(chain)
        for i in range(shapes.OutlineCount())
        for chain in [shapes.Outline(i), *(shapes.Hole(i, h) for h in range(shapes.HoleCount(i)))]
    ]


def flat(chain) -> list[float]:
    return [round(v, 2) for x, y in ring(chain) for v in (x, y)]


def polygons(shapes) -> list[list[list[float]]]:
    shapes.Simplify()

    return [
        [flat(chain) for chain in [shapes.Outline(i), *(shapes.Hole(i, h) for h in range(shapes.HoleCount(i)))]]
        for i in range(shapes.OutlineCount())
    ]


def copper(board, layers) -> dict:
    error = pcbnew.FromMM(0.01)
    shapes = {}

    def shape(net: str, layer: int):
        return shapes.setdefault((net, layer), pcbnew.SHAPE_POLY_SET())

    items = [*board.GetTracks(), *(p for fp in board.GetFootprints() for p in fp.Pads())]

    for item in items:
        net = str(item.GetNetname())

        for layer in layers:
            flashed = item.FlashLayer(layer) if item.GetClass() in ("PCB_VIA", "PAD") else item.GetLayer() == layer

            if net and flashed:
                item.TransformShapeToPolygon(shape(net, layer), layer, 0, error, pcbnew.ERROR_INSIDE)

    for zone in board.Zones():
        net = str(zone.GetNetname())

        if net and not zone.GetIsRuleArea():
            for layer in zone.GetLayerSet().CuStack():
                shape(net, layer).Append(zone.GetFilledPolysList(layer))

    nets = {}

    for (net, layer), shapes_on in shapes.items():
        nets.setdefault(net, {})[str(board.GetLayerName(layer))] = polygons(shapes_on)

    return nets


def drills(board, layers) -> list[dict]:
    def span(item) -> list[int]:
        on = [i for i, layer in enumerate(layers) if item.IsOnLayer(layer)]

        return [min(on), max(on)] if on else [0, len(layers) - 1]

    vias = [
        {"at": [mm(v.GetPosition().x), mm(v.GetPosition().y)], "diameter": mm(v.GetDrillValue()), "plated": True,
         "net": str(v.GetNetname()), "span": span(v)}
        for v in board.GetTracks()
        if v.GetClass() == "PCB_VIA"
    ]
    pads = [
        {"at": [mm(p.GetPosition().x), mm(p.GetPosition().y)], "diameter": mm(min(p.GetDrillSize().x, p.GetDrillSize().y)),
         "plated": p.GetAttribute() == pcbnew.PAD_ATTRIB_PTH, "net": str(p.GetNetname()), "span": [0, len(layers) - 1]}
        for fp in board.GetFootprints()
        for p in fp.Pads()
        if p.GetDrillSize().x > 0
    ]

    return vias + pads


SILK = {"F.Silkscreen": pcbnew.F_SilkS, "B.Silkscreen": pcbnew.B_SilkS}


def silk(board) -> dict:
    error = pcbnew.FromMM(0.01)
    shapes = {name: pcbnew.SHAPE_POLY_SET() for name in SILK}
    items = [*board.GetDrawings()]

    for fp in board.GetFootprints():
        items += [*fp.GraphicalItems(), fp.Reference(), fp.Value()]

    for item in items:
        visible = item.IsVisible() if hasattr(item, "IsVisible") else True

        for name, layer in SILK.items():
            if visible and item.GetLayer() == layer:
                item.TransformShapeToPolygon(shapes[name], layer, 0, error, pcbnew.ERROR_INSIDE)

    return {name: polygons(poly) for name, poly in shapes.items()}


def pads(board) -> list[dict]:
    return [
        {
            "ref": str(fp.GetReference()),
            "number": str(p.GetNumber()),
            "net": str(p.GetNetname()),
            "side": "bottom" if fp.GetLayer() == pcbnew.B_Cu else "top",
            "at": [mm(p.GetPosition().x), mm(p.GetPosition().y)],
        }
        for fp in board.GetFootprints()
        for p in fp.Pads()
        if p.GetNumber()
    ]


def main(source: str, target: str) -> None:
    board = pcbnew.LoadBoard(source)
    footprints = list(board.GetFootprints())
    stack = list(board.GetEnabledLayers().CuStack())
    nets = {
        str(p.GetNetname()) for fp in footprints for p in fp.Pads() if p.GetNetname()
    }

    data = {
        "thickness": mm(board.GetDesignSettings().GetBoardThickness()),
        "outline": outline(board),
        "layers": [
            str(board.GetLayerName(layer))
            for layer in board.GetEnabledLayers().CuStack()
        ],
        "footprints": [footprint(fp) for fp in footprints],
        "holes": holes(footprints),
        "nets": len(nets),
        "vias": sum(1 for t in board.GetTracks() if t.GetClass() == "PCB_VIA"),
        "copper": copper(board, stack),
        "pours": sorted({str(z.GetNetname()) for z in board.Zones() if z.GetNetname() and not z.GetIsRuleArea()}),
        "drills": drills(board, stack),
        "silk": silk(board),
        "pads": pads(board),
    }

    with open(target, "w", encoding="utf-8") as out:
        json.dump(data, out, ensure_ascii=False)


main(sys.argv[1], sys.argv[2])
