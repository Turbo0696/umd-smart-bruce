import { describe, expect, it } from "vitest";
import {
  type Action,
  type SheetState,
  barText,
  canPoint,
  gridKeyAction,
  initialState,
  selRect,
  selectionText,
  sheetReducer,
} from "@/lib/spreadsheetState";

function run(s: SheetState, ...actions: Action[]): SheetState {
  return actions.reduce(sheetReducer, s);
}

const blank = () => initialState({});
const at = (c: number, r: number): Action => ({ type: "mouseDownCell", c, r, shift: false, touch: false, sel: { start: 0, end: 0 } });
const click = (c: number, r: number, start: number, shift = false): Action => ({
  type: "mouseDownCell", c, r, shift, touch: false, sel: { start, end: start },
});

describe("selection and navigation", () => {
  it("moves, extends with shift, and clamps at the edges", () => {
    let s = run(blank(), { type: "move", dc: -1, dr: -1, extend: false });
    expect(s.cur).toEqual([0, 0]);
    s = run(s, { type: "move", dc: 1, dr: 0, extend: true }, { type: "move", dc: 0, dr: 2, extend: true });
    expect(selRect(s)).toEqual({ c0: 0, c1: 1, r0: 0, r1: 2 });
    s = run(s, { type: "move", dc: 50, dr: 50, extend: false });
    expect(s.cur).toEqual([9, 9]);
  });

  it("drag-selects and stops on mouse up", () => {
    let s = run(blank(), at(1, 1), { type: "hoverCell", c: 3, r: 2 });
    expect(selRect(s)).toEqual({ c0: 1, c1: 3, r0: 1, r1: 2 });
    s = run(s, { type: "mouseUp" }, { type: "hoverCell", c: 5, r: 5 });
    expect(s.cur).toEqual([3, 2]);
  });

  it("shift-click extends and header clicks select a whole column, row, or sheet", () => {
    let s = run(blank(), at(1, 1), { type: "mouseUp" }, click(3, 4, 0, true));
    expect(selRect(s)).toEqual({ c0: 1, c1: 3, r0: 1, r1: 4 });
    s = run(s, { type: "selectHeader", header: { col: 2 } });
    expect(selRect(s)).toEqual({ c0: 2, c1: 2, r0: 0, r1: 9 });
    s = run(s, { type: "selectHeader", header: { row: 4 } });
    expect(selRect(s)).toEqual({ c0: 0, c1: 9, r0: 4, r1: 4 });
    s = run(s, { type: "selectHeader", header: "all" });
    expect(selRect(s)).toEqual({ c0: 0, c1: 9, r0: 0, r1: 9 });
  });
});

describe("editing", () => {
  it("typing replaces the cell; Enter commits and moves down", () => {
    let s = run(initialState({ A1: "old" }), { type: "startEdit", init: "x" });
    expect(s.editing).toEqual({ key: "A1", text: "x" });
    s = run(s, { type: "cellInput", text: "42" }, { type: "commit", save: true, dr: 1 });
    expect(s.cells.A1).toBe("42");
    expect(s.cur).toEqual([0, 1]);
    expect(s.editing).toBeNull();
  });

  it("F2 edits the existing text with the caret at the end", () => {
    const s = run(initialState({ A1: "hello" }), { type: "startEdit" });
    expect(s.editing!.text).toBe("hello");
    expect(s.caret).toEqual({ src: "cell", pos: 5, id: 1 });
  });

  it("Escape abandons the edit; an emptied cell is deleted", () => {
    let s = run(initialState({ A1: "keep" }), { type: "startEdit", init: "zzz" }, { type: "commit", save: false });
    expect(s.cells.A1).toBe("keep");
    s = run(s, { type: "startEdit", init: "" }, { type: "commit", save: true });
    expect("A1" in s.cells).toBe(false);
  });

  it("commit is idempotent, so the blur after Enter is harmless", () => {
    const s = run(blank(), { type: "startEdit", init: "7" }, { type: "commit", save: true, dr: 1 });
    expect(run(s, { type: "commit", save: true })).toEqual(s);
  });

  it("clicking another cell commits the edit first", () => {
    const s = run(blank(), { type: "startEdit", init: "5" }, at(2, 2));
    expect(s.cells.A1).toBe("5");
    expect(s.cur).toEqual([2, 2]);
  });

  it("the formula bar edits the current cell live", () => {
    let s = run(blank(), at(1, 0), { type: "mouseUp" }, { type: "barFocus" }, { type: "barInput", text: "=1+1" });
    expect(s.cells.B1).toBe("=1+1");
    expect(barText(s)).toBe("=1+1");
    s = run(s, { type: "barEnter" }, { type: "barBlur" });
    expect(s.cur).toEqual([1, 1]);
  });

  it("Delete clears the selection", () => {
    const s = run(
      initialState({ A1: "1", B1: "2", C1: "3" }),
      { type: "move", dc: 1, dr: 0, extend: true },
      { type: "clearSelection" },
    );
    expect(s.cells).toEqual({ C1: "3" });
  });

  it("a touch tap selects, and a second tap edits", () => {
    const tap: Action = { type: "mouseDownCell", c: 2, r: 2, shift: false, touch: true, sel: { start: 0, end: 0 } };
    let s = run(initialState({ C3: "9" }), tap);
    expect(s.editing).toBeNull();
    expect(s.drag).toBeNull();
    s = run(s, tap);
    expect(s.editing).toEqual({ key: "C3", text: "9" });
  });
});

describe("pointing (building references by clicking)", () => {
  it("clicking a cell after '=' inserts its reference, and clicking again replaces it", () => {
    let s = run(blank(), { type: "startEdit", init: "=" }, click(1, 1, 1));
    expect(s.editing!.text).toBe("=B2");
    expect(s.caret!.pos).toBe(3);
    expect(s.cur).toEqual([0, 0]); // selection stays on the edited cell
    s = run(s, { type: "mouseUp" }, click(2, 2, 3));
    expect(s.editing!.text).toBe("=C3");
  });

  it("dragging builds a range", () => {
    let s = run(blank(), { type: "startEdit", init: "=SUM(" }, click(1, 1, 5), { type: "hoverCell", c: 1, r: 3 });
    expect(s.editing!.text).toBe("=SUM(B2:B4");
    s = run(s, { type: "mouseUp" }, { type: "cellInput", text: s.editing!.text + ")" }, { type: "commit", save: true });
    expect(s.cells.A1).toBe("=SUM(B2:B4)");
  });

  it("shift-click extends the reference being built", () => {
    const s = run(blank(), { type: "startEdit", init: "=" }, click(1, 1, 1), { type: "mouseUp" }, click(3, 3, 3, true));
    expect(s.editing!.text).toBe("=B2:D4");
  });

  it("typing anything ends pointing, so the next click starts a new reference", () => {
    let s = run(blank(), { type: "startEdit", init: "=" }, click(1, 1, 1), { type: "mouseUp" });
    s = run(s, { type: "cellInput", text: "=B2+" }, click(2, 1, 4));
    expect(s.editing!.text).toBe("=B2+C2");
  });

  it("arrow keys point from the edited cell and shift extends", () => {
    let s = run(blank(), { type: "move", dc: 2, dr: 2, extend: false }, { type: "startEdit", init: "=" });
    s = run(s, { type: "pointKey", src: "cell", dc: 1, dr: 0, shift: false, sel: { start: 1, end: 1 } });
    expect(s.editing!.text).toBe("=D3");
    s = run(s, { type: "pointKey", src: "cell", dc: 0, dr: 1, shift: true, sel: { start: 3, end: 3 } });
    expect(s.editing!.text).toBe("=D3:D4");
  });

  it("only points after an operator, paren, or comma", () => {
    const at2 = (text: string, sel: number) => canPoint(run(blank(), { type: "startEdit", init: text }), "cell", sel);
    expect(at2("=", 1)).toBe(true);
    expect(at2("=SUM(", 5)).toBe(true);
    expect(at2("=NORM.INV(0.5, ", 15)).toBe(true);
    expect(at2("=1+ ", 4)).toBe(true);
    expect(at2("=SUM", 4)).toBe(false);
    expect(at2("=B2", 3)).toBe(false);
    expect(at2("text=", 5)).toBe(false);
  });

  it("a click that can't point selects the cell instead", () => {
    const s = run(blank(), { type: "startEdit", init: "=SUM" }, click(4, 4, 4));
    expect(s.cells.A1).toBe("=SUM");
    expect(s.cur).toEqual([4, 4]);
    expect(s.editing).toBeNull();
  });

  it("points from the formula bar too", () => {
    const s = run(blank(), { type: "barFocus" }, { type: "barInput", text: "=" }, click(2, 0, 1));
    expect(s.cells.A1).toBe("=C1");
    expect(s.caret).toEqual({ src: "bar", pos: 3, id: 1 });
  });

  it("F4 cycles the reference under the caret", () => {
    let s = run(blank(), { type: "startEdit", init: "=A1+B2" }, { type: "cycleAbsolute", src: "cell", caret: 2 });
    expect(s.editing!.text).toBe("=$A$1+B2");
    expect(s.caret!.pos).toBe(5);
    s = run(s, { type: "cycleAbsolute", src: "cell", caret: 2 });
    expect(s.editing!.text).toBe("=A$1+B2");
  });
});

describe("fill handle", () => {
  it("previews along the dominant axis and applies on mouse up", () => {
    let s = run(initialState({ A1: "1", A2: "2" }), { type: "move", dc: 0, dr: 1, extend: true });
    s = run(s, { type: "mouseDownFillHandle" }, { type: "hoverCell", c: 0, r: 4 });
    expect(s.drag).toMatchObject({ kind: "fill", dir: "d", n: 3, preview: { c0: 0, c1: 0, r0: 0, r1: 4 } });
    s = run(s, { type: "mouseUp" });
    expect([s.cells.A3, s.cells.A4, s.cells.A5]).toEqual(["3", "4", "5"]);
    expect(selRect(s)).toEqual({ c0: 0, c1: 0, r0: 0, r1: 4 });
    expect(s.drag).toBeNull();
  });

  it("does nothing when released back on the source", () => {
    const start = initialState({ A1: "1" });
    const s = run(start, { type: "mouseDownFillHandle" }, { type: "hoverCell", c: 0, r: 3 }, { type: "hoverCell", c: 0, r: 0 }, { type: "mouseUp" });
    expect(s.cells).toEqual(start.cells);
  });

  it("fills sideways and shifts formulas", () => {
    let s = run(initialState({ A1: "1", A2: "=A1*2" }), { type: "move", dc: 0, dr: 1, extend: false });
    s = run(s, { type: "mouseDownFillHandle" }, { type: "hoverCell", c: 2, r: 1 }, { type: "mouseUp" });
    expect([s.cells.B2, s.cells.C2]).toEqual(["=B1*2", "=C1*2"]);
  });
});

describe("copy, cut, paste", () => {
  it("copies tab-separated text and marks the range", () => {
    const s = run(
      initialState({ A1: "a", B1: "b", A2: "c" }),
      { type: "move", dc: 1, dr: 1, extend: true },
      { type: "copy", cut: false },
    );
    expect(selectionText(s)).toBe("a\tb\nc\t");
    expect(s.copied).toEqual({ c0: 0, c1: 1, r0: 0, r1: 1 });
  });

  it("pasting an internal copy shifts relative references", () => {
    let s = initialState({ A1: "1", B1: "=A1+1" });
    s = run(s, { type: "move", dc: 1, dr: 0, extend: false }, { type: "copy", cut: false }, at(1, 3), { type: "mouseUp" });
    s = run(s, { type: "paste", text: "=A1+1" });
    expect(s.cells.B4).toBe("=A4+1");
  });

  it("pasting text from elsewhere is taken literally, and clips to the sheet", () => {
    let s = run(blank(), at(8, 8), { type: "mouseUp" });
    s = run(s, { type: "paste", text: "1\t2\t3\r\n4\t5\t6\r\n" });
    expect(s.cells).toEqual({ I9: "1", J9: "2", I10: "4", J10: "5" });
    expect(selRect(s)).toEqual({ c0: 8, c1: 9, r0: 8, r1: 9 });
  });

  it("cut moves the values and drops the clip", () => {
    let s = initialState({ A1: "5", B1: "=A1" });
    s = run(s, { type: "move", dc: 1, dr: 0, extend: true }, { type: "copy", cut: true }, at(3, 3), { type: "mouseUp" });
    s = run(s, { type: "paste", text: selectionTextOf(s) });
    expect(s.cells).toEqual({ D4: "5", E4: "=A1" });
    expect(s.clip).toBeNull();
  });

  it("a single value pasted onto a selection fills it", () => {
    let s = run(blank(), at(0, 0), { type: "hoverCell", c: 1, r: 1 }, { type: "mouseUp" });
    s = run(s, { type: "paste", text: "9" });
    expect(Object.keys(s.cells).sort()).toEqual(["A1", "A2", "B1", "B2"]);
  });

  it("ignores an empty paste", () => {
    const s = blank();
    expect(run(s, { type: "paste", text: "\n" })).toEqual(s);
  });
});

describe("gridKeyAction", () => {
  const key = (k: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) =>
    gridKeyAction({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods }, [3, 3]);

  it("maps navigation keys", () => {
    expect(key("ArrowRight")).toEqual({ type: "move", dc: 1, dr: 0, extend: false });
    expect(key("ArrowUp", { shiftKey: true })).toEqual({ type: "move", dc: 0, dr: -1, extend: true });
    expect(key("Enter", { shiftKey: true })).toEqual({ type: "move", dc: 0, dr: -1, extend: false });
    expect(key("Tab")).toEqual({ type: "move", dc: 1, dr: 0, extend: false });
  });

  it("starts an edit on a printable character, but not with Alt or Ctrl held", () => {
    expect(key("=")).toEqual({ type: "startEdit", init: "=" });
    expect(key("a", { altKey: true })).toBeNull();
    expect(key("c", { ctrlKey: true })).toBeNull();
    expect(key("a", { ctrlKey: true })).toEqual({ type: "selectAll" });
    expect(key("F5")).toBeNull();
  });

  it("lets Tab leave the grid at the row edges", () => {
    const at = (k: string, c: number, shiftKey: boolean) =>
      gridKeyAction({ key: k, shiftKey, ctrlKey: false, metaKey: false, altKey: false }, [c, 0]);
    expect(at("Tab", 9, false)).toBeNull();
    expect(at("Tab", 0, true)).toBeNull();
    expect(at("Tab", 9, true)).not.toBeNull();
    expect(at("Tab", 0, false)).not.toBeNull();
  });
});

/** The clipboard text a real cut would have produced. */
function selectionTextOf(s: SheetState): string {
  return s.clip!.text;
}
