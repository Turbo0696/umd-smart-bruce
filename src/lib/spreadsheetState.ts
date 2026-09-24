// Interaction state for the Excel Simulator grid: selection, in-cell and
// formula-bar editing, "pointing" (clicking or arrowing to a cell while typing
// a formula inserts its reference), drag-fill, and copy / cut / paste.
//
// Everything here is a pure reducer so the component only wires up DOM events.
// Anything that needs the DOM — caret position, focus — comes in on the action
// or leaves as `caret`, which the component applies to the active input.

import {
  COLS,
  type Cells,
  type FillDir,
  type Rect,
  N,
  cellKey,
  cycleAbsolute,
  fillRange,
  parseKey,
  shiftFormula,
  withCell,
} from "@/lib/spreadsheet";

/** [col, row], zero-based. */
export type Pos = readonly [number, number];
/** Which text box is being edited: the cell itself or the formula bar. */
export type Src = "cell" | "bar";

interface Pointing {
  src: Src;
  /** The reference being built occupies text[start, end). */
  start: number;
  end: number;
  anchor: Pos;
  cur: Pos;
  /** Set when the reference is whole columns (A:C) or whole rows (2:5) rather than cells. */
  span?: "col" | "row";
}

interface Clip {
  text: string;
  c0: number;
  r0: number;
  cut: boolean;
  rect: Rect;
}

type Drag =
  | { kind: "select" }
  | { kind: "point" }
  | { kind: "fill"; src: Rect; dir: FillDir; n: number; preview: Rect | null };

export interface SheetState {
  cells: Cells;
  anchor: Pos;
  cur: Pos;
  /** In-cell edit in progress; committed to `cells` on Enter / Tab / blur. */
  editing: { key: string; text: string } | null;
  barFocused: boolean;
  pt: Pointing | null;
  /** The "marching ants" range after Copy / Cut. */
  copied: Rect | null;
  clip: Clip | null;
  drag: Drag | null;
  /** Ask the component to focus `src` and put the caret at `pos`. */
  caret: { src: Src; pos: number; id: number } | null;
}

/** A blank sheet: this is used for exams, so nothing is pre-filled. */
export function initialState(cells: Cells = {}): SheetState {
  return {
    cells,
    anchor: [0, 0],
    cur: [0, 0],
    editing: null,
    barFocused: false,
    pt: null,
    copied: null,
    clip: null,
    drag: null,
    caret: null,
  };
}

/* ---------- helpers ---------- */

const clamp = (v: number) => Math.max(0, Math.min(N - 1, v));

export function selRect(s: Pick<SheetState, "anchor" | "cur">): Rect {
  return {
    c0: Math.min(s.anchor[0], s.cur[0]),
    c1: Math.max(s.anchor[0], s.cur[0]),
    r0: Math.min(s.anchor[1], s.cur[1]),
    r1: Math.max(s.anchor[1], s.cur[1]),
  };
}

export function inRect(c: number, r: number, q: Rect | null): boolean {
  return q !== null && c >= q.c0 && c <= q.c1 && r >= q.r0 && r <= q.r1;
}

export function pointingRect(pt: Pointing): Rect {
  return {
    c0: Math.min(pt.anchor[0], pt.cur[0]),
    c1: Math.max(pt.anchor[0], pt.cur[0]),
    r0: Math.min(pt.anchor[1], pt.cur[1]),
    r1: Math.max(pt.anchor[1], pt.cur[1]),
  };
}

function pointingText(pt: Pointing): string {
  const q = pointingRect(pt);
  if (pt.span === "col") return COLS[q.c0] + ":" + COLS[q.c1];
  if (pt.span === "row") return q.r0 + 1 + ":" + (q.r1 + 1);
  return q.c0 === q.c1 && q.r0 === q.r1
    ? cellKey(q.c0, q.r0)
    : cellKey(q.c0, q.r0) + ":" + cellKey(q.c1, q.r1);
}

/** The text in the cell (or formula bar) that `src` refers to. */
export function textOf(s: SheetState, src: Src): string {
  return src === "cell" ? (s.editing?.text ?? "") : (s.cells[cellKey(s.cur[0], s.cur[1])] ?? "");
}

/** What the formula bar shows. */
export function barText(s: SheetState): string {
  return s.editing ? s.editing.text : textOf(s, "bar");
}

function withText(s: SheetState, src: Src, text: string): SheetState {
  if (src === "cell") return s.editing ? { ...s, editing: { ...s.editing, text } } : s;
  return { ...s, cells: withCell(s.cells, cellKey(s.cur[0], s.cur[1]), text) };
}

function withCaret(s: SheetState, src: Src, pos: number): SheetState {
  return { ...s, caret: { src, pos, id: (s.caret?.id ?? 0) + 1 } };
}

/** The text box a click on the grid would insert a reference into, if any. */
export function pointSource(s: SheetState): Src | null {
  return s.editing ? "cell" : s.barFocused ? "bar" : null;
}

/** The corner of a whole-column or whole-row reference that follows the pointer at (c, r). */
function spanCur(span: "col" | "row", c: number, r: number): Pos {
  return span === "col" ? [c, N - 1] : [N - 1, r];
}

/**
 * Can a click or arrow key at `selStart` in `src` insert a cell reference?
 * Only in a formula, right after an operator, "(" or ",", or while already
 * building a reference.
 */
export function canPoint(s: SheetState, src: Src, selStart: number): boolean {
  const text = textOf(s, src);
  if (text[0] !== "=") return false;
  if (s.pt && s.pt.src === src) return true;
  const before = text.slice(0, selStart).trimEnd();
  return before.length > 0 && "=+-*/(,".includes(before[before.length - 1]);
}

function applyPointing(s: SheetState, pt: Pointing): SheetState {
  const text = textOf(s, pt.src);
  const ref = pointingText(pt);
  const end = pt.start + ref.length;
  const next = text.slice(0, pt.start) + ref + text.slice(pt.end);
  return withCaret(withText({ ...s, pt: { ...pt, end } }, pt.src, next), pt.src, end);
}

function move(s: SheetState, dc: number, dr: number, extend: boolean): SheetState {
  const cur: Pos = [clamp(s.cur[0] + dc), clamp(s.cur[1] + dr)];
  return { ...s, cur, anchor: extend ? s.anchor : cur };
}

function commit(s: SheetState, save: boolean): SheetState {
  if (!s.editing) return s;
  const cells = save ? withCell(s.cells, s.editing.key, s.editing.text) : s.cells;
  return { ...s, cells, editing: null, pt: null };
}

function startEdit(s: SheetState, c: number, r: number, init?: string): SheetState {
  const committed = commit(s, true);
  const key = cellKey(c, r);
  const text = init ?? committed.cells[key] ?? "";
  return withCaret({ ...committed, editing: { key, text }, copied: null, pt: null }, "cell", text.length);
}

/** Tab-separated text of the selected cells, as Excel would put on the clipboard. */
export function selectionText(s: SheetState): string {
  const q = selRect(s);
  const rows: string[] = [];
  for (let r = q.r0; r <= q.r1; r++) {
    const row: string[] = [];
    for (let c = q.c0; c <= q.c1; c++) row.push(s.cells[cellKey(c, r)] ?? "");
    rows.push(row.join("\t"));
  }
  return rows.join("\n");
}

const normalizeClip = (t: string) => t.replace(/\r/g, "").replace(/\n+$/, "");

function paste(s: SheetState, raw: string): SheetState {
  const text = normalizeClip(raw);
  if (text === "") return s;
  const grid = text.split("\n").map((l) => l.split("\t"));
  const clip = s.clip && normalizeClip(s.clip.text) === text ? s.clip : null;
  const sel = selRect(s);
  let cells = { ...s.cells };
  if (clip?.cut) {
    for (let r = clip.rect.r0; r <= clip.rect.r1; r++)
      for (let c = clip.rect.c0; c <= clip.rect.c1; c++) delete cells[cellKey(c, r)];
  }
  const h = grid.length;
  const w = grid[0].length;
  // One value pasted onto a multi-cell selection fills the whole selection.
  const fill = h === 1 && w === 1 && (sel.c1 > sel.c0 || sel.r1 > sel.r0);
  const c1 = fill ? sel.c1 : Math.min(N - 1, sel.c0 + w - 1);
  const r1 = fill ? sel.r1 : Math.min(N - 1, sel.r0 + h - 1);
  for (let r = sel.r0; r <= r1; r++) {
    for (let c = sel.c0; c <= c1; c++) {
      let v = fill ? grid[0][0] : (grid[r - sel.r0][c - sel.c0] ?? "");
      if (clip && !clip.cut && v[0] === "=") {
        const sc = clip.c0 + (fill ? 0 : c - sel.c0);
        const sr = clip.r0 + (fill ? 0 : r - sel.r0);
        v = shiftFormula(v, c - sc, r - sr);
      }
      cells = withCell(cells, cellKey(c, r), v);
    }
  }
  return {
    ...s,
    cells,
    anchor: [sel.c0, sel.r0],
    cur: [c1, r1],
    clip: clip?.cut ? null : s.clip,
    copied: null,
  };
}

/** The fill-drag preview for a pointer over cell (c, r). */
function fillPreview(
  src: Rect,
  c: number,
  r: number,
): { dir: FillDir; n: number; preview: Rect | null } {
  const dr = r > src.r1 ? r - src.r1 : r < src.r0 ? r - src.r0 : 0;
  const dc = c > src.c1 ? c - src.c1 : c < src.c0 ? c - src.c0 : 0;
  if (!dr && !dc) return { dir: "d", n: 0, preview: null };
  if (Math.abs(dr) >= Math.abs(dc)) {
    const n = Math.abs(dr);
    return {
      dir: dr > 0 ? "d" : "u",
      n,
      preview: { c0: src.c0, c1: src.c1, r0: dr < 0 ? src.r0 - n : src.r0, r1: dr > 0 ? src.r1 + n : src.r1 },
    };
  }
  const n = Math.abs(dc);
  return {
    dir: dc > 0 ? "r" : "l",
    n,
    preview: { r0: src.r0, r1: src.r1, c0: dc < 0 ? src.c0 - n : src.c0, c1: dc > 0 ? src.c1 + n : src.c1 },
  };
}

/* ---------- actions ---------- */

/** Selection range of the text box under the pointer / caret. */
interface TextSel {
  start: number;
  end: number;
}

export type Action =
  | { type: "mouseDownCell"; c: number; r: number; shift: boolean; touch: boolean; sel: TextSel }
  | { type: "selectHeader"; header: "all" | { col: number } | { row: number }; shift: boolean; sel: TextSel }
  | { type: "hoverHeader"; header: { col: number } | { row: number } }
  | { type: "mouseDownFillHandle" }
  | { type: "hoverCell"; c: number; r: number }
  | { type: "mouseUp" }
  | { type: "dblClickCell"; c: number; r: number }
  | { type: "move"; dc: number; dr: number; extend: boolean }
  | { type: "selectAll" }
  | { type: "startEdit"; init?: string }
  | { type: "clearSelection" }
  | { type: "escape" }
  | { type: "cellInput"; text: string }
  | { type: "barInput"; text: string }
  | { type: "barFocus" }
  | { type: "barBlur" }
  | { type: "barEnter" }
  | { type: "commit"; save: boolean; dc?: number; dr?: number }
  | { type: "clearPointing" }
  | { type: "pointKey"; src: Src; dc: number; dr: number; shift: boolean; sel: TextSel }
  | { type: "cycleAbsolute"; src: Src; caret: number }
  | { type: "copy"; cut: boolean }
  | { type: "paste"; text: string };

export function sheetReducer(s: SheetState, a: Action): SheetState {
  switch (a.type) {
    case "mouseDownCell": {
      const src = pointSource(s);
      if (src && canPoint(s, src, a.sel.start)) {
        const at: Pos = [a.c, a.r];
        const pt: Pointing =
          s.pt && a.shift && !s.pt.span
            ? { ...s.pt, cur: at }
            : s.pt
              ? { ...s.pt, anchor: at, cur: at, span: undefined }
              : { src, start: a.sel.start, end: a.sel.end, anchor: at, cur: at };
        return applyPointing({ ...s, drag: { kind: "point" } }, pt);
      }
      const base = commit(s, true);
      const same =
        base.anchor[0] === base.cur[0] &&
        base.anchor[1] === base.cur[1] &&
        base.cur[0] === a.c &&
        base.cur[1] === a.r;
      // A touch tap on the already-selected cell edits it.
      if (a.touch && same) return startEdit(base, a.c, a.r);
      if (a.shift) return { ...base, cur: [a.c, a.r] };
      return {
        ...base,
        anchor: [a.c, a.r],
        cur: [a.c, a.r],
        drag: a.touch ? null : { kind: "select" },
      };
    }

    case "selectHeader": {
      const h = a.header;
      const src = pointSource(s);
      // While typing a formula, a header inserts a whole column (A:A) or row (2:2).
      if (h !== "all" && src && canPoint(s, src, a.sel.start)) {
        const span = "col" in h ? "col" : "row";
        const first: Pos = "col" in h ? [h.col, 0] : [0, h.row];
        const last = spanCur(span, first[0], first[1]);
        const pt: Pointing =
          s.pt && s.pt.span === span && a.shift
            ? { ...s.pt, cur: last }
            : s.pt
              ? { ...s.pt, span, anchor: first, cur: last }
              : { src, start: a.sel.start, end: a.sel.end, span, anchor: first, cur: last };
        return applyPointing({ ...s, drag: { kind: "point" } }, pt);
      }
      const base = commit(s, true);
      if (h === "all") return { ...base, anchor: [0, 0], cur: [N - 1, N - 1] };
      if ("col" in h) return { ...base, anchor: [h.col, 0], cur: [h.col, N - 1] };
      return { ...base, anchor: [0, h.row], cur: [N - 1, h.row] };
    }

    case "mouseDownFillHandle": {
      const base = commit(s, true);
      return {
        ...base,
        copied: null,
        drag: { kind: "fill", src: selRect(base), dir: "d", n: 0, preview: null },
      };
    }

    case "hoverCell": {
      const d = s.drag;
      if (!d) return s;
      if (d.kind === "point") {
        if (!s.pt) return s;
        const cur: Pos = s.pt.span ? spanCur(s.pt.span, a.c, a.r) : [a.c, a.r];
        return applyPointing(s, { ...s.pt, cur });
      }
      if (d.kind === "fill") {
        return { ...s, drag: { ...d, ...fillPreview(d.src, a.c, a.r) } };
      }
      if (a.c === s.cur[0] && a.r === s.cur[1]) return s;
      return { ...s, cur: [a.c, a.r] };
    }

    case "hoverHeader": {
      // Dragging across headers grows a whole-column / whole-row reference of the same kind.
      const span = "col" in a.header ? "col" : "row";
      if (s.drag?.kind !== "point" || !s.pt || s.pt.span !== span) return s;
      const cur = "col" in a.header ? spanCur("col", a.header.col, 0) : spanCur("row", 0, a.header.row);
      return applyPointing(s, { ...s.pt, cur });
    }

    case "mouseUp": {
      const d = s.drag;
      if (!d) return s;
      if (d.kind === "fill" && d.preview && d.n > 0) {
        return {
          ...s,
          cells: fillRange(s.cells, d.src, d.dir, d.n),
          anchor: [d.preview.c0, d.preview.r0],
          cur: [d.preview.c1, d.preview.r1],
          drag: null,
        };
      }
      return { ...s, drag: null };
    }

    case "dblClickCell":
      return s.pt ? s : startEdit(s, a.c, a.r);

    case "move":
      return move(s, a.dc, a.dr, a.extend);

    case "selectAll":
      return { ...s, anchor: [0, 0], cur: [N - 1, N - 1] };

    case "startEdit":
      return startEdit(s, s.cur[0], s.cur[1], a.init);

    case "clearSelection": {
      const q = selRect(s);
      const cells = { ...s.cells };
      for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) delete cells[cellKey(c, r)];
      return { ...s, cells, copied: null };
    }

    case "escape":
      return { ...s, copied: null };

    case "cellInput":
      return s.editing ? { ...s, editing: { ...s.editing, text: a.text }, pt: null } : s;

    case "barInput":
      return { ...withText(s, "bar", a.text), pt: null, copied: null };

    case "barFocus":
      return { ...s, barFocused: true };

    case "barBlur":
      return { ...s, barFocused: false, pt: null };

    case "barEnter":
      return move({ ...s, pt: null }, 0, 1, false);

    case "commit": {
      const base = commit(s, a.save);
      return a.dc || a.dr ? move(base, a.dc ?? 0, a.dr ?? 0, false) : base;
    }

    case "clearPointing":
      return s.pt ? { ...s, pt: null } : s;

    case "pointKey": {
      if (!canPoint(s, a.src, a.sel.start)) return s;
      let pt = s.pt;
      if (!pt) {
        const at: Pos = a.src === "cell" ? parseKey(s.editing!.key) : s.cur;
        pt = { src: a.src, start: a.sel.start, end: a.sel.end, anchor: at, cur: at };
      }
      // A whole-column reference only moves sideways and a whole-row one only up and down.
      if ((pt.span === "col" && a.dc === 0) || (pt.span === "row" && a.dr === 0)) return s;
      if (pt.span === "col") {
        const c = clamp(pt.cur[0] + a.dc);
        return applyPointing(s, { ...pt, cur: [c, N - 1], anchor: a.shift ? pt.anchor : [c, 0] });
      }
      if (pt.span === "row") {
        const r = clamp(pt.cur[1] + a.dr);
        return applyPointing(s, { ...pt, cur: [N - 1, r], anchor: a.shift ? pt.anchor : [0, r] });
      }
      const cur: Pos = [clamp(pt.cur[0] + a.dc), clamp(pt.cur[1] + a.dr)];
      return applyPointing(s, { ...pt, cur, anchor: a.shift ? pt.anchor : cur });
    }

    case "cycleAbsolute": {
      const res = cycleAbsolute(textOf(s, a.src), a.caret);
      if (!res) return s;
      return withCaret({ ...withText(s, a.src, res.text), pt: null }, a.src, res.caret);
    }

    case "copy": {
      const rect = selRect(s);
      return {
        ...s,
        clip: { text: selectionText(s), c0: rect.c0, r0: rect.r0, cut: a.cut, rect },
        copied: rect,
      };
    }

    case "paste":
      return paste(s, a.text);
  }
}

/** Key → action for keys pressed while the grid (not a text box) has focus. */
export function gridKeyAction(
  e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  cur: Pos,
): Action | null {
  const k = e.key;
  if (e.ctrlKey || e.metaKey) return k === "a" || k === "A" ? { type: "selectAll" } : null;
  const ext = e.shiftKey;
  switch (k) {
    case "ArrowDown": return { type: "move", dc: 0, dr: 1, extend: ext };
    case "ArrowUp": return { type: "move", dc: 0, dr: -1, extend: ext };
    case "ArrowLeft": return { type: "move", dc: -1, dr: 0, extend: ext };
    case "ArrowRight": return { type: "move", dc: 1, dr: 0, extend: ext };
    case "Enter": return { type: "move", dc: 0, dr: e.shiftKey ? -1 : 1, extend: false };
    case "Tab":
      // Tab walks along the row but lets focus leave the grid at either edge,
      // so keyboard users aren't trapped in it.
      if (e.shiftKey ? cur[0] === 0 : cur[0] === N - 1) return null;
      return { type: "move", dc: e.shiftKey ? -1 : 1, dr: 0, extend: false };
    case "F2": return { type: "startEdit" };
    case "Delete":
    case "Backspace": return { type: "clearSelection" };
    case "Escape": return { type: "escape" };
  }
  if (k.length === 1 && !e.altKey) return { type: "startEdit", init: k };
  return null;
}
