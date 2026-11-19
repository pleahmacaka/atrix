import json
import sys
from functools import reduce
from pathlib import Path

import numpy as np
import trimesh
from build123d import (
    Align,
    Axis,
    Box,
    Cone,
    Cylinder,
    Part,
    Plane,
    Pos,
    Rectangle,
    Rot,
    chamfer,
    export_step,
    fillet,
    loft,
)

MM = 0.001
MIN3 = (Align.MIN, Align.MIN, Align.MIN)
BASE = (Align.CENTER, Align.CENTER, Align.MIN)

SIDES = {"left": (0, 0), "right": (0, 1), "front": (1, 0), "back": (1, 1)}
GAP = 0.2
# a printed wall thinner than two 0.4 mm perimeters is dropped by slicers
MIN_WALL = 0.8
RIM = 0.45

PART_TITLES = {"shell": "본체", "lid": "덮개", "plunger": "버튼 캡", "windows": "인디케이터 창"}


class Placement:
    def __init__(self, pcb: dict, position: list[float], rotation: float, tilt: float = 0.0):
        board = pcb["dims"]["board"]
        self.center = np.array([(board["min"][0] + board["max"][0]) / 2, (board["min"][1] + board["max"][1]) / 2])
        self.position = np.array(position, dtype=float)
        self.tilt = tilt
        yaw, roll = np.radians(rotation), np.radians(tilt)
        spin = np.array([[np.cos(yaw), -np.sin(yaw), 0], [np.sin(yaw), np.cos(yaw), 0], [0, 0, 1]])
        stand = np.array([[1, 0, 0], [0, np.cos(roll), -np.sin(roll)], [0, np.sin(roll), np.cos(roll)]])
        self.rot = spin @ stand

    def point(self, x: float, y: float, z: float) -> np.ndarray:
        return self.rot @ np.array([x - self.center[0], self.center[1] - y, z]) + self.position

    def box(self, lo: list[float], hi: list[float]) -> tuple[np.ndarray, np.ndarray]:
        corners = [self.point(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]

        return np.min(corners, axis=0), np.max(corners, axis=0)


class Board:
    def __init__(self, pcb: dict, placement: Placement, extend: dict | None = None):
        self.pcb = pcb
        self.place = placement
        board = pcb["dims"]["board"]
        self.lo, self.hi = placement.box(board["min"], board["max"])
        self.parts = {}
        self.holes = [(placement.point(*h["at"], 0)[:2], h["diameter"]) for h in pcb.get("holes", [])]

        for fp in pcb["footprints"]:
            if fp.get("box3d"):
                lo, hi = list(fp["box3d"]["min"]), list(fp["box3d"]["max"])
                override = (extend or {}).get(fp["ref"], {})
                hi[2] = max(hi[2], override.get("top", hi[2]))
                lo[2] = override.get("bottom", lo[2])
                self.parts[fp["ref"]] = placement.box(lo, hi)

    @property
    def flat(self) -> bool:
        return abs(self.place.tilt) < 1e-6


def cube(lo, hi) -> Part | None:
    lo, hi = np.asarray(lo, dtype=float), np.asarray(hi, dtype=float)
    size = hi - lo

    if np.any(size <= 1e-6):
        return None

    return Pos(*lo.tolist()) * Box(*size.tolist(), align=MIN3)


def cylinder(center, radius: float, z0: float, z1: float) -> Part | None:
    if z1 - z0 <= 1e-6:
        return None

    return Pos(float(center[0]), float(center[1]), z0) * Cylinder(radius, z1 - z0, align=BASE)


def cone(center, r0: float, r1: float, z0: float, z1: float) -> Part:
    return Pos(float(center[0]), float(center[1]), z0) * Cone(r0, r1, z1 - z0, align=BASE)


def rod_x(x0: float, x1: float, y: float, z: float, r0: float, r1: float | None = None) -> Part:
    r1 = r0 if r1 is None else r1
    a, b = sorted([x0, x1])
    ra, rb = (r0, r1) if x0 <= x1 else (r1, r0)
    body = Cylinder(ra, b - a, align=BASE) if abs(ra - rb) < 1e-9 else Cone(ra, rb, b - a, align=BASE)

    return Pos(a, y, z) * Rot(0, 90, 0) * body


def wall_rod(axis: int, at, r: float, a: float, b: float) -> Part:
    a, b = sorted([a, b])
    u, v = at
    body = Cylinder(r, b - a, align=BASE)

    if axis == 0:
        return Pos(a, u, v) * Rot(0, 90, 0) * body

    return Pos(u, a, v) * Rot(-90, 0, 0) * body


def frustum(center, normal, across, size: tuple[float, float], grow: float, depth: float) -> Part:
    inner = Plane(origin=tuple(center), x_dir=tuple(across), z_dir=tuple(normal))
    outer = Plane(origin=tuple(np.asarray(center) + np.asarray(normal) * depth), x_dir=tuple(across), z_dir=tuple(normal))

    return loft([inner * Rectangle(*size), outer * Rectangle(size[0] + 2 * grow, size[1] + 2 * grow)])


def union(solids) -> Part | None:
    items = [s for s in solids if s is not None]

    return reduce(lambda a, b: a + b, items) if items else None


def add(a, b):
    return union([a, b])


def sub(a, b):
    if a is None or b is None:
        return a

    return a - b


def inter(a, b):
    if a is None or b is None:
        return None

    return a & b


def volume(solid) -> float:
    return solid.volume if solid is not None else 0.0


def mesh(solid: Part) -> trimesh.Trimesh:
    vertices, triangles = solid.tessellate(0.01, 0.2)

    return trimesh.Trimesh(vertices=np.array([(v.X, v.Y, v.Z) for v in vertices]), faces=np.array(triangles))


def side_value(case: dict, side: str, key: str) -> float:
    return case.get("sides", {}).get(side, {}).get(key, case[key])


def expand(box, by: float):
    return box[0] - by, box[1] + by


class Case:
    def __init__(self, case: dict, boards: list[Board]):
        self.case = case
        self.boards = boards
        self.openings = [o if isinstance(o, dict) else {"ref": o} for o in case.get("openings", [])]
        passing = {o["ref"] for o in self.openings}
        boxes = []

        for b in boards:
            boxes.append((b.lo, b.hi))

            for ref, (lo, hi) in b.parts.items():
                boxes.append((np.array([*b.lo[:2], lo[2]]), np.array([*b.hi[:2], hi[2]])) if ref in passing else (lo, hi))

        lo = np.min([b[0] for b in boxes], axis=0)
        hi = np.max([b[1] for b in boxes], axis=0)

        for side, (axis, end) in SIDES.items():
            gap = side_value(case, side, "clearance")
            (hi if end else lo)[axis] += gap if end else -gap

        lo[2] -= case["clearance"]
        hi[2] += case.get("headroom", case["clearance"])
        self.lo, self.hi = lo, hi
        self.seams = set()
        self.settle()

    def settle(self):
        case = self.case
        self.outer_lo = self.lo - np.array([side_value(case, "left", "wall"), side_value(case, "front", "wall"), case["floor"]])
        self.outer_hi = self.hi + np.array([side_value(case, "right", "wall"), side_value(case, "back", "wall"), 0.0])
        self.top = self.outer_hi[2]
        self.roof = self.top + case["lid"]

    def align(self, cases: dict[str, "Case"]):
        for rule in self.case.get("align", []):
            other = cases[rule["case"]]
            axis = rule["axis"]
            ends = rule.get("ends", ["lo", "hi"])

            if axis == 2:
                if "lo" in ends:
                    self.lo[2] -= max(self.outer_lo[2] - other.outer_lo[2], 0.0)

                if "hi" in ends:
                    self.hi[2] += max(other.roof - self.roof, 0.0)

                self.settle()
                continue

            if "lo" in ends:
                self.lo[axis] -= max(self.outer_lo[axis] - other.outer_lo[axis], 0.0)

            if "hi" in ends:
                self.hi[axis] += max(other.outer_hi[axis] - self.outer_hi[axis], 0.0)

        self.settle()

    def envelope(self) -> Part:
        body = cube(self.outer_lo, [*self.outer_hi[:2], self.roof])
        flat = [(SIDES[s][0], (self.outer_hi if SIDES[s][1] else self.outer_lo)[SIDES[s][0]]) for s in self.seams]

        def free(edge) -> bool:
            c = edge.center()

            return not any(abs((c.X, c.Y)[axis] - at) < 1e-6 for axis, at in flat)

        if self.case.get("round"):
            body = fillet([e for e in body.edges().filter_by(Axis.Z) if free(e)], self.case["round"])

        if self.case.get("edge"):
            body = fillet([e for e in body.faces().sort_by(Axis.Z)[-1].edges() if free(e)], self.case["edge"])
            # a fillet on the bed-facing edge prints as a flat overhang; a 45 degree chamfer does not
            body = chamfer([e for e in body.faces().sort_by(Axis.Z)[0].edges() if free(e)], self.case["edge"])

        return body

    def doubler(self, parts_clear) -> Part | None:
        slabs = []

        for side in self.seams:
            axis, end = SIDES[side]
            extra = self.case.get("seamWall", 0.0) - side_value(self.case, side, "wall")

            if extra <= 0:
                continue

            lo, hi = self.lo.copy(), self.hi.copy()
            lo[2], hi[2] = self.lo[2] - 0.05, self.top - 2.2

            if end:
                lo[axis] = self.hi[axis] - extra
            else:
                hi[axis] = self.lo[axis] + extra

            slabs.append(cube(lo, hi))

        drop = np.array([0, 0, self.roof])
        boards_clear = union([cube(b.lo - 0.2, b.hi + np.array([0.2, 0.2, 0.0]) + drop) for b in self.boards])
        parts_drop = union([cube(lo - 0.4, hi + drop) for lo, hi in self.all_parts()])

        return sub(union(slabs), union([parts_clear, boards_clear, parts_drop]))

    def all_parts(self):
        return [box for b in self.boards for box in b.parts.values()]

    def reach(self, lo, hi):
        lo, hi = np.array(lo, dtype=float), np.array(hi, dtype=float)

        for axis in (0, 1):
            inner_lo, inner_hi = self.lo[axis] + GAP, self.hi[axis] - GAP

            if lo[axis] > inner_lo and lo[axis] - inner_lo < MIN_WALL:
                lo[axis] = self.lo[axis] - 1.0

            if hi[axis] < inner_hi and inner_hi - hi[axis] < MIN_WALL:
                hi[axis] = self.hi[axis] + 1.0

        return lo, hi

    def round_clear(self, at, radius: float, z0: float, z1: float) -> Part:
        lo, hi = np.array([at[0] - radius, at[1] - radius, z0]), np.array([at[0] + radius, at[1] + radius, z1])
        bridges = []

        for axis in (0, 1):
            if lo[axis] < self.lo[axis] + GAP + MIN_WALL:
                b_lo, b_hi = lo.copy(), hi.copy()
                b_lo[axis], b_hi[axis] = self.lo[axis] - 1.0, at[axis]
                bridges.append(cube(b_lo, b_hi))

            if hi[axis] > self.hi[axis] - GAP - MIN_WALL:
                b_lo, b_hi = lo.copy(), hi.copy()
                b_lo[axis], b_hi[axis] = at[axis], self.hi[axis] + 1.0
                bridges.append(cube(b_lo, b_hi))

        return union([cylinder(at, radius, z0, z1), *bridges])

    def parts_clear(self, by: float = 0.4):
        return union([cube(*self.reach(*expand(box, by))) for box in self.all_parts()])

    def webs(self, boxes) -> Part | None:
        filled = []

        for i, (a_lo, a_hi) in enumerate(boxes):
            for b_lo, b_hi in boxes[i + 1:]:
                if a_hi[2] <= b_lo[2] or b_hi[2] <= a_lo[2]:
                    continue

                for axis in (0, 1):
                    across = 1 - axis
                    gap_lo, gap_hi = (a_hi[axis], b_lo[axis]) if a_hi[axis] <= b_lo[axis] else (b_hi[axis], a_lo[axis])
                    span_lo, span_hi = max(a_lo[across], b_lo[across]), min(a_hi[across], b_hi[across])

                    if 0 < gap_hi - gap_lo < MIN_WALL and span_hi > span_lo:
                        lo, hi = np.zeros(3), np.zeros(3)
                        lo[axis], hi[axis] = gap_lo - 0.01, gap_hi + 0.01
                        lo[across], hi[across] = span_lo, span_hi
                        lo[2], hi[2] = max(a_lo[2], b_lo[2]), min(a_hi[2], b_hi[2])
                        filled.append(cube(lo, hi))

        return union(filled)

    def opening_cuts(self) -> list[tuple[Part, Part | None]]:
        cuts, notches = [], []

        for opening in self.openings:
            margin = opening.get("margin", self.case["openingMargin"])

            for b in self.boards:
                if opening["ref"] not in b.parts:
                    continue

                lo, hi = expand(b.parts[opening["ref"]], margin)
                top = hi[2]

                if opening.get("above"):
                    lo[2] = max(lo[2], b.hi[2] - margin)

                gaps = {
                    side: (self.hi[axis] - hi[axis]) if end else (lo[axis] - self.lo[axis])
                    for side, (axis, end) in SIDES.items()
                }
                side = opening.get("side") or min(gaps, key=gaps.get)
                axis, end = SIDES[side]
                edge = self.hi[axis] if end else self.lo[axis]
                reach = side_value(self.case, side, "wall") + 1.0

                inside = 1.5 if opening.get("notch") else 1.0

                if end:
                    lo[axis] = max(lo[axis], edge - inside)
                    hi[axis] = edge + reach
                else:
                    hi[axis] = min(hi[axis], edge + inside)
                    lo[axis] = edge - reach

                if opening.get("notch"):
                    hi[2] = self.top + 1.0

                filler, cut = None, cube(lo, hi)

                if opening.get("notch"):
                    band = sub(cube(self.outer_lo, self.outer_hi + np.array([0, 0, 0.01])), cube(self.lo, self.hi + np.array([0, 0, 1.0])))
                    across = 1 - axis
                    flo, fhi = lo.copy(), hi.copy()
                    flo[across] += 0.2
                    fhi[across] -= 0.2
                    filler = inter(band, cube([flo[0], flo[1], top + 0.2], [fhi[0], fhi[1], self.top + 0.01]))
                    notches.append((lo.copy(), hi.copy(), axis, top))
                else:
                    cut = add(cut, self.chamfer(lo, hi, axis, end, side_value(self.case, side, "wall")))

                cuts.append((cut, filler))

        return cuts + self.notch_bridges(notches)

    def notch_bridges(self, notches: list) -> list[tuple[Part, Part]]:
        band = sub(cube(self.outer_lo, self.outer_hi + np.array([0, 0, 0.01])), cube(self.lo, self.hi + np.array([0, 0, 1.0])))
        bridges = []

        for i, (a_lo, a_hi, axis, a_top) in enumerate(notches):
            for b_lo, b_hi, b_axis, b_top in notches[i + 1:]:
                across = 1 - axis
                gap_lo, gap_hi = (a_hi[across], b_lo[across]) if a_hi[across] <= b_lo[across] else (b_hi[across], a_lo[across])

                if b_axis != axis or not 0 < gap_hi - gap_lo < MIN_WALL:
                    continue

                lo, hi = np.maximum(a_lo, b_lo), np.minimum(a_hi, b_hi)
                lo[across], hi[across] = gap_lo - 0.01, gap_hi + 0.01
                flo, fhi = lo.copy(), hi.copy()
                flo[across], fhi[across] = gap_lo - 0.2, gap_hi + 0.2
                filler = inter(band, cube([flo[0], flo[1], max(a_top, b_top) + 0.2], [fhi[0], fhi[1], self.top + 0.01]))
                bridges.append((cube(lo, hi), filler))

        return bridges

    def chamfer(self, lo, hi, axis: int, end: int, wall: float) -> Part:
        size = min(self.case.get("chamfer", 0.6), wall - RIM)
        across = 1 - axis
        normal, unit = np.zeros(3), np.zeros(3)
        normal[axis], unit[across] = (1 if end else -1), 1
        center = (lo + hi) / 2
        center[axis] = (self.outer_hi if end else self.outer_lo)[axis] - normal[axis] * size

        return frustum(center, normal, unit, (hi[across] - lo[across], hi[2] - lo[2]), size + 0.3, size + 0.3)

    def holes(self) -> tuple[list[Part], list[Part]]:
        cuts, keepouts = [], []

        for hole in self.case.get("holes", []):
            radius = hole["diameter"] / 2
            face = hole["face"]

            if face == "top":
                cuts.append(cylinder(hole["at"], radius, self.top - 1, self.roof + 1))
                keepouts.append(cylinder(hole["at"], radius + 1.5, self.top - hole.get("depth", 10), self.top + 0.01))
                continue

            axis, end = SIDES[face]
            inward = -1 if end else 1
            wall_in = self.hi[axis] if end else self.lo[axis]
            wall_out = self.outer_hi[axis] if end else self.outer_lo[axis]
            depth = hole.get("depth", 10)

            cuts.append(wall_rod(axis, hole["at"], radius, wall_in + inward, wall_out - inward))
            keepouts.append(wall_rod(axis, hole["at"], radius + 1.5, wall_in - inward * 0.01, wall_in + inward * depth))

        return cuts, keepouts

    def ledges(self) -> Part | None:
        width = self.case.get("ledge", 1.2)
        solids = []

        for b in self.boards:
            if not b.flat:
                continue

            bottom = b.lo[2]
            frame = cube([b.lo[0] - 1.0, b.lo[1] - 1.0, self.lo[2] - 0.05], [b.hi[0] + 1.0, b.hi[1] + 1.0, bottom])
            inner_lo, inner_hi = b.lo + width, b.hi - width
            boxes = []

            for lo, hi in (self.reach(*expand(box, 0.4)) for box in self.all_parts()):
                for axis in (0, 1):
                    if inner_lo[axis] - MIN_WALL < hi[axis] < inner_lo[axis]:
                        hi[axis] = inner_lo[axis] + 0.01

                    if inner_hi[axis] < lo[axis] < inner_hi[axis] + MIN_WALL:
                        lo[axis] = inner_hi[axis] - 0.01

                boxes.append((lo, hi))

            cuts = [cube(lo, hi) for lo, hi in boxes] + [self.webs(boxes)]
            solids.append(sub(frame, union([cube([*inner_lo[:2], self.lo[2] - 1], [*inner_hi[:2], bottom + 1]), *cuts])))

        return union(solids)

    def passages(self) -> Part | None:
        return union([cube([*c["lo"], self.lo[2] - 1], [*c["hi"], self.top + 1]) for c in self.case.get("passages", [])])

    def fastener(self, variant: str | None) -> tuple[dict, dict]:
        spec = self.case["screws"]

        return spec, next((v for v in spec["variants"] if v["id"] == variant), spec["variants"][0])

    def bosses(self) -> tuple[Part | None, Part | None, Part | None]:
        posts, pilots, clear = [], [], []
        skin = self.lo[2] - self.case["floor"] + 0.6

        for b in self.boards:
            if not b.flat or not b.holes:
                continue

            assert "screws" in self.case, f"{self.case.get('id')} has board holes but no screws spec"
            spec = self.case["screws"]

            for c, diameter in b.holes:
                assert diameter >= spec["size"], f"board hole {diameter} mm does not pass an M{spec['size']:g} screw"
                posts.append(cylinder(c, spec.get("post", 8.0) / 2, self.lo[2] - 0.05, b.lo[2]))
                pilots.append(cylinder(c, min(v["hole"] for v in spec["variants"]) / 2, skin, b.lo[2] + 0.05))
                clear.append(cylinder(c, spec["head"] / 2 + 0.5, b.hi[2], self.roof + 1))

        return union(posts), union(pilots), union(clear)

    def ribs(self) -> Part | None:
        width = self.case.get("ledge", 1.2)
        solids = []

        for b in self.boards:
            if not b.flat:
                continue

            frame = cube([b.lo[0] - 1.0, b.lo[1] - 1.0, b.hi[2] + 0.1], [b.hi[0] + 1.0, b.hi[1] + 1.0, self.top])
            solids.append(sub(frame, cube([b.lo[0] + width, b.lo[1] + width, self.lo[2]], [b.hi[0] - width, b.hi[1] - width, self.roof])))

        return union(solids)

    def slots(self) -> tuple[Part | None, Part | None]:
        floor_rails, lid_rails = [], []
        rail, gap, grip = 1.0, 0.15, 1.5

        for b in self.boards:
            if b.flat:
                continue

            size = b.hi - b.lo
            normal = int(np.argmin(size[:2]))
            along = 1 - normal

            for start, stop in ((b.lo[normal] - gap - rail, b.lo[normal] - gap), (b.hi[normal] + gap, b.hi[normal] + gap + rail)):
                lo, hi = np.zeros(3), np.zeros(3)
                lo[normal], hi[normal] = start, stop
                lo[along], hi[along] = b.lo[along], b.hi[along]
                lo[2], hi[2] = self.lo[2] - 0.05, b.lo[2] + grip
                floor_rails.append(cube(lo, hi))
                lo[2], hi[2] = b.hi[2] - grip, self.top + 0.01
                lid_rails.append(cube(lo, hi))

            if b.lo[2] > self.lo[2]:
                lo, hi = b.lo.copy(), b.hi.copy()
                lo[2], hi[2] = self.lo[2] - 0.05, b.lo[2]
                floor_rails.append(cube(lo, hi))

        return union(floor_rails), union(lid_rails)

    def lights(self):
        margin, step, wall = 0.25, 0.3, self.case.get("lightWall", 1.2)
        refs = set(self.case.get("lights", []))
        blocks, channels, holes, windows, spots, channel_boxes = [], [], [], [], [], []

        for b in self.boards:
            for ref in refs & set(b.parts):
                lo, hi = b.parts[ref]
                floor = hi[2] + 0.4
                channel_boxes.append(self.reach([lo[0] - margin, lo[1] - margin, floor - 1], [hi[0] + margin, hi[1] + margin, self.top - 0.35]))
                channels.append(cube(*channel_boxes[-1]))
                spots.append(((lo[:2] + hi[:2]) / 2, max(hi[:2] - lo[:2]) / 2 + margin + step, min(hi[:2] - lo[:2]) / 2, lo, hi, floor))

        for i, (center, radius, body, lo, hi, floor) in enumerate(spots):
            others = [np.linalg.norm(center - c) for j, (c, *_) in enumerate(spots) if j != i]
            # neighbouring lights keep a printable web between their holes instead of merging into one knife edge
            radius = max(min([radius, *[(d - MIN_WALL) / 2 for d in others]]), body)
            ring = radius + MIN_WALL
            block_lo = np.minimum(lo[:2] - margin - wall, center - ring)
            block_hi = np.maximum(hi[:2] + margin + wall, center + ring)
            blocks.append(cube([*block_lo, floor], [*block_hi, self.top]))
            holes.append(cylinder(center, radius, self.top - 0.4, self.roof + 1))
            windows.append(cylinder(center, radius, self.top, self.roof))

        return union(blocks), union(channels), union(holes), union(windows), refs, channel_boxes

    def buttons(self):
        guides, holes, plungers, keepouts = [], [], [], []

        for button in self.case.get("buttons", []):
            for b in self.boards:
                if button["ref"] not in b.parts:
                    continue

                lo, hi = b.parts[button["ref"]]
                center = (lo[:2] + hi[:2]) / 2
                radius = button.get("diameter", 6.0) / 2
                bore = radius + 0.2
                rest = hi[2] + 0.2
                flange_top = rest + 1.2
                guides.append(sub(cylinder(center, bore + 1.2, flange_top + 0.6, self.top), cylinder(center, bore, flange_top, self.top + 1)))
                holes.append(cylinder(center, bore, self.top - 1, self.roof + 1))
                plungers.append(add(cylinder(center, radius, rest, self.roof + button.get("rise", 1.5)), cylinder(center, radius + 1.2, rest, flange_top)))
                keepouts.append(cylinder(center, radius + 1.6, rest - 1, self.roof + 2))

        return union(guides), union(holes), union(plungers), union(keepouts)

    def screws(self, variant: str | None):
        spec = self.case.get("screws")

        if not spec:
            return None, None, None, None, None

        posts, holes, bosses, passes, clear = [], [], [], [], []
        spec, kind = self.fastener(variant)
        radius, boss_depth = spec.get("post", 8.0) / 2, spec.get("boss", 1.0)
        shank, head = spec["size"] / 2 + 0.2, spec["head"] / 2 + 0.15
        sink = head - shank

        for at in spec["posts"]:
            seat = self.top - boss_depth
            posts.append(cylinder(at, radius, self.lo[2] - 0.05, seat))
            clear.append(self.round_clear(at, radius + 0.3, self.lo[2] - 1, seat))
            holes.append(cylinder(at, kind["hole"] / 2, seat - kind["depth"], seat + 0.05))
            bosses.append(cylinder(at, radius, seat, self.top + 0.05))
            passes.append(cylinder(at, shank, seat - 0.05, self.roof + 1))
            passes.append(cone(at, shank, head, self.roof - sink, self.roof + 0.05))

        return union(posts), union(holes), union(bosses), union(passes), union(clear)

    def struts(self) -> Part | None:
        solids = []

        for strut in self.case.get("struts", []):
            axis, end = SIDES[strut["side"]]
            across = 1 - axis
            face = self.hi[axis] if end else self.lo[axis]
            out = 1 if end else -1
            lo, hi = np.zeros(3), np.zeros(3)
            lo[across], hi[across] = strut["from"], strut["to"]
            lo[axis], hi[axis] = sorted([face + out * 0.05, face - out * strut["depth"]])
            lo[2], hi[2] = max(b.hi[2] for b in self.boards if b.flat) + 0.1, self.top
            solids.append(cube(lo, hi))

        return union(solids)

    def hooks(self):
        slots, nubs = [], []

        for hook in self.case.get("hooks", []):
            axis, end = SIDES[hook["side"]]
            across = 1 - axis
            face = self.hi[axis] if end else self.lo[axis]
            out = 1 if end else -1
            wall = side_value(self.case, hook["side"], "wall")
            lo, hi = np.zeros(3), np.zeros(3)
            lo[across], hi[across] = hook["from"], hook["to"]
            lo[axis], hi[axis] = sorted([face - out * 0.6, face + out * (wall - 0.5)])
            lo[2], hi[2] = self.top - 1.4, self.top - 0.8
            nubs.append(cube(lo, hi))
            lo[across] -= 0.3
            hi[across] += 0.3
            lo[axis], hi[axis] = sorted([face - out * 0.05, face + out * (wall - 0.4)])
            lo[2], hi[2] = self.top - 1.6, self.top - 0.6
            slots.append(cube(lo, hi))

        return union(slots), union(nubs)

    def build(self, cases: dict[str, "Case"] | None = None, variant: str | None = None) -> dict[str, Part]:
        cases = cases or {}
        cuts = self.opening_cuts()
        holes, hole_keepouts = self.holes()
        parts_clear = self.parts_clear()
        light_blocks, channels, light_holes, windows, light_refs, channel_boxes = self.lights()
        webs = self.webs([*(self.reach(*expand(box, 0.4)) for box in self.all_parts()), *channel_boxes])
        guides, button_holes, plungers, keepouts = self.buttons()
        posts, pilots, screw_heads = self.bosses()
        screw_posts, screw_holes, screw_bosses, screw_passes, screw_clear = self.screws(variant)
        slots, nubs = self.hooks()
        floor_rails, lid_rails = self.slots()

        envelope = self.envelope()
        below = cube(self.outer_lo - 1, [*(self.outer_hi[:2] + 1), self.top])
        shell = sub(inter(envelope, below), cube(self.lo, self.hi + np.array([0, 0, 1.0])))
        passages = self.passages()
        shell = add(shell, sub(union([self.ledges(), posts, screw_posts, floor_rails]), union([parts_clear, passages, webs])))
        shell = add(shell, self.doubler(union([parts_clear, webs])))
        joint_cuts, joint_clear = None, None

        for other in cases.values():
            spec = other.case.get("joint")
            chosen = next((v for v in (spec or {}).get("variants", []) if v["id"] == variant), None)
            spec = {**spec, **chosen} if chosen else spec

            if spec and (other is self or spec["case"] == self.case.get("id")):
                tongues, joint_cuts, joint_clear = joint_solids(other, cases[spec["case"]], spec)[0 if other is self else 1]
                shell = add(shell, tongues)

        shell = sub(shell, union([pilots, screw_holes, slots, union([c for c, _ in cuts]), union(holes), joint_cuts]))

        led_parts = union([cube(*expand(b.parts[r], 0.4)) for b in self.boards for r in light_refs if r in b.parts])
        others_clear = sub(parts_clear, led_parts)
        cut_keepouts = union([c for c, _ in cuts])

        cover = sub(envelope, below)
        ring = inter(
            cube(self.lo + np.array([0.2, 0.2, 0]), self.hi - np.array([0.2, 0.2, 0])),
            cube([self.lo[0], self.lo[1], self.top - 2], [self.hi[0], self.hi[1], self.top]),
        )
        ring = sub(ring, cube(self.lo + np.array([1.4, 1.4, -1]), self.hi - np.array([1.4, 1.4, -1])))
        ring = sub(ring, union([cube([lo[0] - MIN_WALL, lo[1] - MIN_WALL, lo[2]], [hi[0] + MIN_WALL, hi[1] + MIN_WALL, self.top + 0.05]) for lo, hi in channel_boxes]))
        features = union([sub(union([self.ribs(), lid_rails, self.struts()]), parts_clear), ring, light_blocks])
        boards_clear = union([cube(*expand((b.lo, b.hi), 0.2)) for b in self.boards if not b.flat])
        features = sub(features, union([others_clear, boards_clear, cut_keepouts, union(hole_keepouts), keepouts, channels, screw_heads, screw_clear, joint_clear, passages, webs]))
        features = add(features, sub(guides, others_clear))
        features = inter(features, cube([self.lo[0] + 0.2, self.lo[1] + 0.2, self.lo[2] - 1], [self.hi[0] - 0.2, self.hi[1] - 0.2, self.top + 0.05]))
        lid = union([cover, features, union([f for _, f in cuts]), screw_bosses, nubs])
        lid = inter(sub(lid, union([light_holes, button_holes, union(holes), screw_passes, shell])), envelope)

        solids = {"shell": shell, "lid": lid}

        if plungers is not None:
            solids["plunger"] = plungers

        if windows is not None:
            solids["windows"] = windows

        return solids

    def colliders(self) -> dict[str, list]:
        (x0, y0), (x1, y1) = self.lo[:2] + 0.2, self.hi[:2] - 0.2
        z0, band = self.top - 2, 1.2
        sides = [
            [[x0, y0, z0], [x1, y0 + band, self.top]],
            [[x0, y1 - band, z0], [x1, y1, self.top]],
            [[x0, y0, z0], [x0 + band, y1, self.top]],
            [[x1 - band, y0, z0], [x1, y1, self.top]],
        ]

        return {
            "shell": "mesh",
            "lid": [[self.outer_lo[:2].tolist() + [self.top], self.outer_hi[:2].tolist() + [self.roof]]]
            + [[np.round(lo, 3).tolist(), np.round(hi, 3).tolist()] for lo, hi in sides],
        }


def joint_solids(carrier: Case, host: Case, spec: dict) -> tuple[tuple[Part, Part, Part], tuple[Part, Part, Part]]:
    axis, end = SIDES[spec["side"]]
    assert axis == 0, "joints face along x"
    out = 1 if end else -1
    face = carrier.outer_hi[0] if end else carrier.outer_lo[0]
    host_face = host.outer_lo[0] if end else host.outer_hi[0]
    assert out * (face - host_face) <= 0.01, f"{carrier.case.get('id')} overlaps {host.case.get('id')} by {out * (face - host_face):.2f} mm at the joint"
    reach, play = spec.get("reach", 2.5), spec.get("play", 0.15)
    z0, z1 = spec.get("band", (0.0, 0.0))
    tongues, windows, clear, pockets = [], [], [], []

    for y0, y1 in spec.get("tongues", []):
        root, tip = sorted([face - out * 0.5, face + out * reach])
        tongues.append(cube([root, y0, z0], [tip, y1, z1]))
        a, b = sorted([face - out * 0.01, face + out * (reach + play)])
        windows.append(cube([a, y0 - play, z0 - play], [b, y1 + play, z1 + play]))
        clear.append(cube(*host.reach([a - 0.3, y0 - 0.5, z0 - 0.5], [b + 0.3, y1 + 0.5, z1 + 0.5])))

    magnet = spec.get("magnet", {"diameter": 6.0, "thickness": 1.0})
    radius, depth = magnet["diameter"] / 2 + spec.get("fit", -0.05), magnet["thickness"] + 0.1
    boss, back = radius + spec.get("boss", 0.6), depth + spec.get("backing", 0.5)
    bosses = []

    for y, z in spec.get("magnets", []):
        pockets.append(rod_x(face + out * 0.01, face - out * depth, y, z, radius))
        windows.append(rod_x(host_face - out * 0.01, host_face + out * depth, y, z, radius))
        tongues.append(rod_x(face - out * 0.05, face - out * back, y, z, boss))
        bosses.append(rod_x(host_face + out * 0.05, host_face + out * back, y, z, boss))

    for case, solids, drop in ((host, union(tongues), False), (host, union(bosses), True), (carrier, union(tongues), True)):
        rise = np.array([0, 0, case.roof if drop else 0.0])
        boxes = [(lo - 0.4, hi + 0.4) for lo, hi in case.all_parts()] + [(b.lo - 0.2, b.hi + 0.2) for b in case.boards]
        hit = volume(inter(solids, union([cube(lo, hi + rise) for lo, hi in boxes])))
        assert hit < 1e-3, f"joint solid in {case.case.get('id')} hits a part or its drop path ({hit:.3f} mm3)"

    return (union(tongues), union(pockets), None), (union(bosses), union(windows), union(clear))


def board_colliders(b: Board) -> list:
    boxes = [(b.lo, b.hi)] + list(b.parts.values())

    return [[np.round(lo, 3).tolist(), np.round(hi, 3).tolist()] for lo, hi in boxes]


def export_part(solid: Part, out: Path, name: str):
    export_step(solid, str(out / f"{name}.step"))
    m = mesh(solid)
    m.export(out / f"{name}.stl")
    scaled = m.copy()
    scaled.apply_scale(MM)
    # board GLBs are Y-up with board Y on +Z; the case frame is Z-up with board Y flipped
    scaled.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    scaled.export(out / f"{name}.glb")


def make_cases(assembly: dict, pcbs: dict[str, dict]) -> tuple[dict[str, Board], dict[str, Case]]:
    boards = {
        entry["id"]: Board(
            pcbs[entry["id"]],
            Placement(pcbs[entry["id"]], entry["position"], entry["rotation"], entry.get("tilt", 0.0)),
            entry.get("extend"),
        )
        for entry in assembly["boards"]
    }
    cases = {
        spec["id"]: Case({**assembly.get("defaults", {}), **spec}, [boards[k] for k in spec["boards"]])
        for spec in assembly.get("cases", [])
    }

    for _ in range(2):
        for case in cases.values():
            case.align(cases)

    opposite = {"left": "right", "right": "left", "front": "back", "back": "front"}

    for case in cases.values():
        if spec := case.case.get("joint"):
            case.seams.add(spec["side"])
            cases[spec["case"]].seams.add(opposite[spec["side"]])

    return boards, cases


def run(assembly: dict, pcbs: dict[str, dict], out: Path):
    boards, cases = make_cases(assembly, pcbs)
    index, colliders = [], {"boards": {k: board_colliders(b) for k, b in boards.items()}, "cases": {}}

    for spec in assembly.get("cases", []):
        case = cases[spec["id"]]
        joints = [c.case["joint"] for c in cases.values() if "joint" in c.case and spec["id"] in (c.case["id"], c.case["joint"]["case"])]
        variants = spec.get("screws", {}).get("variants", []) + [v for j in joints for v in j.get("variants", [])]
        solids = case.build(cases, variants[0]["id"] if variants else None)
        folder = out / "cases" / spec["id"]
        folder.mkdir(parents=True, exist_ok=True)
        own = {name: [] for name in solids}

        for name, solid in solids.items():
            export_part(solid, folder, name)

        for variant in variants[1:]:
            for name, solid in case.build(cases, variant["id"]).items():
                if abs(volume(solid) - volume(solids[name])) > 1e-3:
                    export_part(solid, folder, f"{name}.{variant['id']}")
                    own[name].append(variant["id"])

        size = (case.outer_hi - case.outer_lo + np.array([0, 0, case.case["lid"]])).round(2).tolist()
        index.append({
            "id": spec["id"],
            "title": spec.get("title", spec["id"]),
            "boards": spec["boards"],
            "size": size,
            "variants": [{"id": v["id"], "title": v["title"]} for v in variants],
            "parts": [
                {"name": n, "title": PART_TITLES.get(n, n), "translucent": n == "windows", "variants": own[n]}
                for n in solids
            ],
        })
        colliders["cases"][spec["id"]] = case.colliders()

    (out / "cases.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    (out / "colliders.json").write_text(json.dumps(colliders), encoding="utf-8")


def demo():
    pcb = {
        "dims": {"board": {"min": [0, 0, 0], "max": [10, 4, 1.6]}, "envelope": {"min": [0, 0, -1], "max": [10, 4, 5]}},
        "holes": [{"at": [1.5, 2.0], "diameter": 3.2}],
        "footprints": [
            {"ref": "D1", "box3d": {"min": [2, 1, 1.6], "max": [3, 2, 2.3]}},
            {"ref": "SW1", "box3d": {"min": [6, 0.5, 1.6], "max": [9, 3.5, 4]}},
        ],
    }
    p = Placement(pcb, [0, 0, 0], 180)
    assert np.allclose(p.point(10, 0, 0), [-5, -2, 0])
    standing = Placement(pcb, [0, 0, 0], 90, 90)
    assert np.allclose(standing.point(10, 2, 1.6), [1.6, 5, 0])
    assert np.allclose(standing.point(5, 0, 0), [0, 0, 2])
    mount = {"size": 3.0, "head": 6.0, "post": 7.0, "posts": [], "variants": [{"id": "tap", "title": "b", "hole": 2.5, "depth": 6.0}]}
    case = Case(
        {"wall": 1.6, "floor": 1.6, "lid": 1.6, "clearance": 3.0, "openingMargin": 0.4, "lights": ["D1"], "buttons": [{"ref": "SW1", "diameter": 2}], "screws": mount},
        [Board(pcb, Placement(pcb, [0, 0, 0], 0))],
    )
    solids = case.build()
    assert set(solids) == {"shell", "lid", "plunger", "windows"}
    assert mesh(solids["lid"]).is_watertight
    assert all(volume(s) > 0 and s.is_valid for s in solids.values())
    assert volume(inter(solids["plunger"], solids["lid"])) < 1e-6
    board, at = case.boards[0], case.boards[0].holes[0][0]
    pilot = cylinder(at, 2.5 / 2 - 0.1, case.lo[2] + 0.1, board.lo[2] - 0.1)
    post = sub(cylinder(at, 7.0 / 2 - 0.1, case.lo[2] + 0.1, board.lo[2] - 0.1), pilot)
    assert volume(inter(solids["shell"], post)) > 0
    assert volume(inter(solids["shell"], pilot)) < 1e-6

    base = {"wall": 1.6, "floor": 1.6, "lid": 1.6, "clearance": 0.5, "openingMargin": 0.4, "headroom": 6.0, "round": 2.5, "edge": 1.0}
    wide = {**pcb, "dims": {**pcb["dims"], "board": {"min": [0, 0, 0], "max": [30, 40, 1.6]}, "envelope": {"min": [0, 0, -3], "max": [30, 40, 5]}}}
    screws = {
        "size": 3.0, "head": 6.0, "posts": [[0, 10]],
        "variants": [{"id": "insert", "title": "a", "hole": 4.0, "depth": 5.0}, {"id": "tap", "title": "b", "hole": 2.5, "depth": 6.0}],
    }
    joint = {"case": "a", "side": "left", "tongues": [[-8, -5], [5, 8]], "band": [6.0, 7.5]}
    assembly = {
        "boards": [
            {"id": "a", "position": [0, 0, 0], "rotation": 0},
            {"id": "b", "position": [20.5, 0, 4], "rotation": 90, "tilt": 90},
        ],
        "cases": [
            {**base, "id": "a", "boards": ["a"], "screws": screws, "hooks": [{"side": "front", "from": -5, "to": 5}], "align": [{"case": "b", "axis": 2}]},
            {**base, "id": "b", "boards": ["b"], "joint": joint, "seamWall": 2.0, "sides": {"left": {"clearance": 1.6}}, "align": [{"case": "a", "axis": 2}]},
        ],
    }
    small = {**pcb, "holes": [], "dims": {**pcb["dims"], "board": {"min": [0, 0, 0], "max": [30, 12, 1.6]}}}
    _, cases = make_cases(assembly, {"a": wide, "b": small})
    assert abs(cases["a"].roof - cases["b"].roof) < 1e-6 and abs(cases["a"].outer_lo[2] - cases["b"].outer_lo[2]) < 1e-6
    insert, tap = cases["a"].build(cases, "insert"), cases["a"].build(cases, "tap")
    battery = cases["b"].build(cases)
    assert abs(volume(insert["shell"]) - volume(tap["shell"])) > 1
    assert volume(inter(insert["lid"], cylinder([0, 10], 1.0, cases["a"].top - 2, cases["a"].roof + 1))) < 1e-6
    assert volume(inter(insert["shell"], insert["lid"])) < 1e-3
    assert volume(inter(insert["shell"], battery["shell"])) < 1e-3
    assert insert["shell"].bounding_box().max.X <= cases["a"].outer_hi[0] + 1e-6
    face, seam = cases["b"].outer_lo[0], cases["a"].outer_hi[0]
    assert abs(battery["shell"].bounding_box().min.X - (face - 2.5)) < 1e-3
    assert volume(inter(battery["shell"], cube([face - 2.4, -7, 6.2], [face - 0.1, -6, 7.3]))) > 1
    assert volume(inter(insert["shell"], cube([seam - 2.6, -8.1, 5.9], [seam + 0.1, -4.9, 7.6]))) < 1e-6
    lo, hi, mid = cases["a"].outer_lo, cases["a"].outer_hi, 7.0
    assert volume(inter(insert["shell"], cube([lo[0], lo[1], mid], [lo[0] + 0.3, lo[1] + 0.3, mid + 1]))) < 1e-6
    assert volume(inter(insert["shell"], cube([hi[0] - 0.3, lo[1], mid], [hi[0], lo[1] + 0.3, mid + 1]))) > 0.08
    assert volume(inter(insert["lid"], cube([lo[0] + 5, lo[1], cases["a"].roof - 0.2], [lo[0] + 6, lo[1] + 0.2, cases["a"].roof]))) < 1e-6


if __name__ == "__main__":
    demo()

    if len(sys.argv) > 1:
        assembly = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        paths = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
        pcbs = {k: json.loads(Path(v).read_text(encoding="utf-8")) for k, v in paths.items()}
        run(assembly, pcbs, Path(sys.argv[3]))
