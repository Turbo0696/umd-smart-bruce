"use client";

import {
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import {
  COLS,
  FUNCTION_GROUPS,
  N,
  cellKey,
  evaluateSheet,
  formatNumber,
} from "@/lib/spreadsheet";
import {
  type Src,
  barText,
  canPoint,
  gridKeyAction,
  inRect,
  initialState,
  pointingRect,
  selRect,
  selectionText,
  sheetReducer,
} from "@/lib/spreadsheetState";

const ARROWS: Record<string, { dc: number; dr: number }> = {
  ArrowUp: { dc: 0, dr: -1 },
  ArrowDown: { dc: 0, dr: 1 },
  ArrowLeft: { dc: -1, dr: 0 },
  ArrowRight: { dc: 1, dr: 0 },
};

const isInput = (t: EventTarget) => (t as HTMLElement).tagName === "INPUT";

/** Scrolls the grid (never the page) just enough to show `td` below/beside the sticky headers. */
function reveal(wrap: HTMLElement, td: HTMLElement) {
  const w = wrap.getBoundingClientRect();
  const t = td.getBoundingClientRect();
  const headW = wrap.querySelector("tbody th")?.getBoundingClientRect().width ?? 0;
  const headH = wrap.querySelector("thead th")?.getBoundingClientRect().height ?? 0;
  if (t.left < w.left + headW) wrap.scrollLeft -= w.left + headW - t.left;
  else if (t.right > w.right) wrap.scrollLeft += t.right - w.right;
  if (t.top < w.top + headH) wrap.scrollTop -= w.top + headH - t.top;
  else if (t.bottom > w.bottom) wrap.scrollTop += t.bottom - w.bottom;
}

function tryWrite(text: string) {
  try {
    navigator.clipboard.writeText(text).catch(() => {});
  } catch {
    // Clipboard access can be unavailable (insecure context, embedded frame).
  }
}

// Fixed pixel widths keep every column the same size however long a value is;
// long values are cut off with an ellipsis, as in the original sheet.
const ROW_HEADER_W = 36;
const COL_W = 88;

const HEADER =
  "border border-zinc-300 bg-zinc-100 text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400";
const HEADER_ACTIVE = "bg-emerald-100! font-bold text-emerald-800 dark:bg-emerald-950! dark:text-emerald-300";

const TOOL_BUTTON =
  "rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1 text-sm text-zinc-900 hover:border-zinc-500 active:bg-emerald-700 active:text-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

export function ExcelSimulator() {
  const [s, dispatch] = useReducer(sheetReducer, undefined, () => initialState());
  const wrapRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLInputElement>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);
  // Touch taps arrive as touchstart then a synthesized mousedown.
  const touched = useRef(false);

  const results = useMemo(() => evaluateSheet(s.cells), [s.cells]);

  // Focus the active text box and place the caret where the reducer asked.
  useLayoutEffect(() => {
    const c = s.caret;
    if (!c) return;
    const el = c.src === "cell" ? cellInputRef.current : barRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(c.pos, c.pos);
  }, [s.caret]);

  // Drags end wherever the pointer is released, not just over the grid.
  useEffect(() => {
    const up = () => dispatch({ type: "mouseUp" });
    document.addEventListener("mouseup", up);
    return () => document.removeEventListener("mouseup", up);
  }, []);

  const followKey = s.pt ? cellKey(s.pt.cur[0], s.pt.cur[1]) : cellKey(s.cur[0], s.cur[1]);
  useEffect(() => {
    const wrap = wrapRef.current;
    const td = wrap?.querySelector<HTMLElement>(`[data-cell="${followKey}"]`);
    if (wrap && td) reveal(wrap, td);
  }, [followKey]);

  const sel = selRect(s);
  const multi = sel.c1 > sel.c0 || sel.r1 > sel.r0;
  const ptRect = s.pt ? pointingRect(s.pt) : null;
  const fillRect = s.drag?.kind === "fill" ? s.drag.preview : null;
  const filling = s.drag?.kind === "fill";

  let status = "Ready";
  if (multi) {
    let count = 0;
    const nums: number[] = [];
    for (let r = sel.r0; r <= sel.r1; r++) {
      for (let c = sel.c0; c <= sel.c1; c++) {
        const k = cellKey(c, r);
        if (s.cells[k]) count++;
        const n = results[k].num;
        if (n !== null) nums.push(n);
      }
    }
    status = `Count: ${count}`;
    if (nums.length) {
      const total = nums.reduce((a, b) => a + b, 0);
      status +=
        `   Sum: ${formatNumber(total)}   Average: ${formatNumber(total / nums.length)}` +
        `   Min: ${formatNumber(Math.min(...nums))}   Max: ${formatNumber(Math.max(...nums))}`;
    }
  }

  const focusGrid = () => wrapRef.current?.focus({ preventScroll: true });

  function textSel(el: HTMLInputElement | null) {
    return { start: el?.selectionStart ?? 0, end: el?.selectionEnd ?? 0 };
  }

  /** F4 and (while building a formula) arrow keys, shared by the cell editor and the formula bar. */
  function handleFormulaKey(e: KeyboardEvent<HTMLInputElement>, src: Src): boolean {
    if (e.key === "F4") {
      e.preventDefault();
      dispatch({ type: "cycleAbsolute", src, caret: e.currentTarget.selectionStart ?? 0 });
      return true;
    }
    const arrow = ARROWS[e.key];
    if (arrow && !e.ctrlKey && !e.metaKey) {
      const range = textSel(e.currentTarget);
      if (canPoint(s, src, range.start)) {
        e.preventDefault();
        dispatch({ type: "pointKey", src, ...arrow, shift: e.shiftKey, sel: range });
        return true;
      }
    }
    return false;
  }

  function onCellKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (handleFormulaKey(e, "cell")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      dispatch({ type: "commit", save: true, dr: 1 });
      focusGrid();
    } else if (e.key === "Tab") {
      e.preventDefault();
      dispatch({ type: "commit", save: true, dc: e.shiftKey ? -1 : 1 });
      focusGrid();
    } else if (e.key === "Escape") {
      e.preventDefault();
      dispatch({ type: "commit", save: false });
      focusGrid();
    }
  }

  function onBarKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (handleFormulaKey(e, "bar")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      dispatch({ type: "barEnter" });
      focusGrid();
    }
  }

  function onCellMouseDown(e: ReactMouseEvent, c: number, r: number) {
    if (isInput(e.target) || e.button !== 0) return;
    e.preventDefault();
    const touch = touched.current;
    touched.current = false;
    // A click while typing a formula inserts a reference and must leave focus
    // where it is; anything else moves focus back to the grid.
    const src: Src | null = s.editing ? "cell" : s.barFocused ? "bar" : null;
    const input = src === "cell" ? cellInputRef.current : src === "bar" ? barRef.current : null;
    const range = textSel(input);
    const pointing = src !== null && canPoint(s, src, range.start);
    dispatch({ type: "mouseDownCell", c, r, shift: e.shiftKey, touch, sel: range });
    if (!pointing) focusGrid();
  }

  function onHeaderMouseDown(e: ReactMouseEvent, header: "all" | { col: number } | { row: number }) {
    if (e.button !== 0) return;
    e.preventDefault();
    touched.current = false;
    dispatch({ type: "selectHeader", header });
    focusGrid();
  }

  function onHandleMouseDown(e: ReactMouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: "mouseDownFillHandle" });
    focusGrid();
  }

  function onPasteButton() {
    if (s.clip) dispatch({ type: "paste", text: s.clip.text });
    else {
      try {
        navigator.clipboard
          .readText()
          .then((text) => dispatch({ type: "paste", text }))
          .catch(() => {});
      } catch {
        // See tryWrite.
      }
    }
    focusGrid();
  }

  const name = multi ? `${cellKey(sel.c0, sel.r0)}:${cellKey(sel.c1, sel.r1)}` : cellKey(s.cur[0], s.cur[1]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Excel Simulator</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        A 10 × 10 practice spreadsheet with Excel&apos;s statistical functions. Type numbers and
        formulas, fill down, and copy and paste just like Excel.
      </p>

      <div
        className={`mt-6 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 ${
          filling ? "[&_td]:cursor-crosshair" : ""
        }`}
      >
        <div className="flex items-center justify-between bg-emerald-700 px-3 py-2 font-semibold text-white">
          <span>Sheet1</span>
          <small className="font-normal opacity-85">10 × 10</small>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-zinc-200 bg-white p-1.5 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            className={TOOL_BUTTON}
            onClick={() => {
              tryWrite(selectionText(s));
              dispatch({ type: "copy", cut: false });
              focusGrid();
            }}
          >
            Copy
          </button>
          <button
            type="button"
            className={TOOL_BUTTON}
            onClick={() => {
              tryWrite(selectionText(s));
              dispatch({ type: "copy", cut: true });
              focusGrid();
            }}
          >
            Cut
          </button>
          <button type="button" className={TOOL_BUTTON} onClick={onPasteButton}>
            Paste
          </button>
        </div>

        <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-white p-1.5 dark:border-zinc-800 dark:bg-zinc-900">
          <input
            readOnly
            value={name}
            aria-label="Cell name"
            className="w-[78px] rounded-md border border-zinc-300 bg-white p-1 text-center text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <span className="px-1 text-sm text-zinc-500 italic" aria-hidden="true">
            fx
          </span>
          <input
            ref={barRef}
            value={barText(s)}
            aria-label="Formula bar"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => dispatch({ type: "barInput", text: e.target.value })}
            onFocus={() => dispatch({ type: "barFocus" })}
            onBlur={() => dispatch({ type: "barBlur" })}
            onMouseDown={() => dispatch({ type: "clearPointing" })}
            onKeyDown={onBarKeyDown}
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:outline-2 focus:-outline-offset-1 focus:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <div
          ref={wrapRef}
          tabIndex={0}
          role="group"
          aria-label="Spreadsheet grid. Type to enter a value, F2 to edit, arrow keys to move."
          onKeyDown={(e) => {
            if (isInput(e.target)) return;
            const action = gridKeyAction(e, s.cur);
            if (action) {
              e.preventDefault();
              dispatch(action);
            }
          }}
          onCopy={(e) => {
            if (isInput(e.target)) return;
            e.preventDefault();
            e.clipboardData.setData("text/plain", selectionText(s));
            dispatch({ type: "copy", cut: false });
          }}
          onCut={(e) => {
            if (isInput(e.target)) return;
            e.preventDefault();
            e.clipboardData.setData("text/plain", selectionText(s));
            dispatch({ type: "copy", cut: true });
          }}
          onPaste={(e) => {
            if (isInput(e.target)) return;
            e.preventDefault();
            dispatch({ type: "paste", text: e.clipboardData.getData("text/plain") });
          }}
          onTouchStart={() => {
            touched.current = true;
          }}
          className="relative max-w-full overflow-auto bg-white pr-1.5 pb-1.5 outline-none select-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-inset dark:bg-zinc-900"
        >
          <table
            role="grid"
            aria-label="Spreadsheet, columns A to J, rows 1 to 10"
            aria-multiselectable="true"
            style={{ width: ROW_HEADER_W + COL_W * N }}
            className="min-w-full table-fixed border-collapse text-sm text-zinc-900 dark:text-zinc-50"
          >
            <colgroup>
              <col style={{ width: ROW_HEADER_W }} />
              {COLS.split("").map((c) => (
                <col key={c} style={{ width: COL_W }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  aria-label="Select all"
                  onMouseDown={(e) => onHeaderMouseDown(e, "all")}
                  className={`sticky top-0 left-0 z-20 h-6 cursor-pointer ${HEADER}`}
                />
                {COLS.split("").map((c, i) => (
                  <th
                    key={c}
                    scope="col"
                    onMouseDown={(e) => onHeaderMouseDown(e, { col: i })}
                    className={`sticky top-0 z-10 h-6 cursor-pointer ${HEADER} ${
                      i >= sel.c0 && i <= sel.c1 ? HEADER_ACTIVE : ""
                    }`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: N }, (_, r) => (
                <tr key={r}>
                  <th
                    scope="row"
                    onMouseDown={(e) => onHeaderMouseDown(e, { row: r })}
                    className={`sticky left-0 z-[5] cursor-pointer ${HEADER} ${
                      r >= sel.r0 && r <= sel.r1 ? HEADER_ACTIVE : ""
                    }`}
                  >
                    {r + 1}
                  </th>
                  {Array.from({ length: N }, (_, c) => {
                    const k = cellKey(c, r);
                    const res = results[k];
                    const isCur = c === s.cur[0] && r === s.cur[1];
                    const inSel = inRect(c, r, sel);
                    const editingHere = s.editing?.key === k;
                    const showHandle = !s.editing && c === sel.c1 && r === sel.r1;

                    const outline = inRect(c, r, ptRect)
                      ? "outline-2 -outline-offset-2 outline-dashed outline-emerald-600 dark:outline-emerald-400"
                      : inRect(c, r, fillRect)
                        ? "outline-1 -outline-offset-2 outline-dashed outline-zinc-900 dark:outline-zinc-100"
                        : isCur
                          ? "outline-2 -outline-offset-2 outline-emerald-700 dark:outline-emerald-400"
                          : inRect(c, r, s.copied)
                            ? "outline-1 -outline-offset-2 outline-dashed outline-emerald-700 dark:outline-emerald-400"
                            : "";
                    const bg = inRect(c, r, ptRect)
                      ? "bg-emerald-100 dark:bg-emerald-950"
                      : inSel && !isCur
                        ? "bg-emerald-50 dark:bg-emerald-950/60"
                        : "";
                    const align =
                      res.kind === "number"
                        ? "text-right"
                        : res.kind === "error"
                          ? "text-center text-rose-600 dark:text-rose-400"
                          : "";

                    return (
                      <td
                        key={k}
                        role="gridcell"
                        data-cell={k}
                        aria-selected={inSel}
                        onMouseDown={(e) => onCellMouseDown(e, c, r)}
                        onMouseOver={() => s.drag && dispatch({ type: "hoverCell", c, r })}
                        onDoubleClick={(e) => {
                          if (!isInput(e.target)) dispatch({ type: "dblClickCell", c, r });
                        }}
                        className={`relative h-6 cursor-cell border border-zinc-300 p-0 dark:border-zinc-700 ${bg} ${outline} ${align}`}
                      >
                        {editingHere ? (
                          <input
                            ref={cellInputRef}
                            value={s.editing!.text}
                            aria-label={`Editing ${k}`}
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(e) => dispatch({ type: "cellInput", text: e.target.value })}
                            onMouseDown={() => dispatch({ type: "clearPointing" })}
                            onBlur={() => dispatch({ type: "commit", save: true })}
                            onKeyDown={onCellKeyDown}
                            className="block h-full w-full border-0 bg-white px-1 text-inherit outline-none select-text dark:bg-zinc-900"
                          />
                        ) : (
                          <div className="truncate px-1 leading-6">{res.text}</div>
                        )}
                        {showHandle && (
                          <div
                            title="Drag to fill"
                            onMouseDown={onHandleMouseDown}
                            className="absolute -right-[5px] -bottom-[5px] z-[4] h-[9px] w-[9px] cursor-crosshair border border-white bg-emerald-700 dark:border-zinc-900 dark:bg-emerald-400"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          role="status"
          className="min-h-7 border-t border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
        >
          {status}
        </div>
      </div>

      <div className="mt-5 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        {FUNCTION_GROUPS.map(({ label, names }) => (
          <p key={label} className="leading-relaxed">
            <b className="font-semibold text-zinc-900 dark:text-zinc-50">{label}</b>{" "}
            {names.map((fn) => (
              <code
                key={fn}
                className="mr-1 inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
              >
                {fn}
              </code>
            ))}
          </p>
        ))}
        <p className="leading-relaxed">
          Drag or Shift+click to select · Ctrl+C / X / V · Delete clears · Drag the green corner
          square to fill · While typing a formula, click, drag, or use the arrow keys to insert cell
          references, and press F4 to toggle{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            $A$1
          </code>
          . On a touch screen, tap a selected cell again to edit it.
        </p>
      </div>
    </div>
  );
}
