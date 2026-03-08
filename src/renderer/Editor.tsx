import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";

export type EditorHandle = {
  getValue: () => string;
  setValue: (value: string) => void;
  getSelection: () => { from: number; to: number; text: string };
  replaceSelection: (text: string) => void;
  replaceRange: (from: number, to: number, text: string) => void;
  setPinnedSelection: (range: { from: number; to: number } | null) => void;
  getSelectionRect: () => { left: number; top: number; bottom: number } | null;
};

type EditorProps = {
  initialValue: string;
  onChange: (value: string) => void;
  onSelectionChange: (text: string, rect: { left: number; top: number; bottom: number } | null) => void;
};

const setPinnedSelectionEffect = StateEffect.define<{ from: number; to: number } | null>();

const pinnedSelectionField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setPinnedSelectionEffect)) {
        const range = effect.value;
        if (!range || range.from === range.to) {
          return Decoration.none;
        }
        const from = Math.min(range.from, range.to);
        const to = Math.max(range.from, range.to);
        return Decoration.set([Decoration.mark({ class: "cm-pinned-selection" }).range(from, to)]);
      }
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

function computeSelectionRect(view: EditorView, from: number, to: number) {
  if (from === to) return null;
  const head = Math.min(from, to);
  const tail = Math.max(from, to);
  const startRect = view.coordsAtPos(head) ?? view.coordsAtPos(Math.min(head + 1, view.state.doc.length));
  const endProbe = Math.max(head, tail - 1);
  const endRect = view.coordsAtPos(endProbe) ?? view.coordsAtPos(tail);
  if (!startRect || !endRect) return null;
  const left = Math.min(startRect.left, endRect.left);
  const top = Math.min(startRect.top, endRect.top);
  const bottom = Math.max(startRect.bottom, endRect.bottom);
  return { left, top, bottom };
}

const Editor = forwardRef<EditorHandle, EditorProps>(({ initialValue, onChange, onSelectionChange }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSelectionRef = useRef(onSelectionChange);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSelectionRef.current = onSelectionChange;
  }, [onChange, onSelectionChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        markdown(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        pinnedSelectionField,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
          if (update.selectionSet) {
            const sel = update.state.selection.main;
            const text = update.state.doc.sliceString(sel.from, sel.to);
            if (sel.from === sel.to) {
              onSelectionRef.current(text, null);
            } else {
              onSelectionRef.current(text, computeSelectionRect(update.view, sel.from, sel.to));
            }
          }
        })
      ]
    });

    const view = new EditorView({
      state,
      parent: containerRef.current
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [initialValue]);

  useImperativeHandle(ref, () => ({
    getValue: () => viewRef.current?.state.doc.toString() ?? "",
    setValue: (value: string) => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current === value) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value }
      });
    },
    getSelection: () => {
      const view = viewRef.current;
      if (!view) return { from: 0, to: 0, text: "" };
      const sel = view.state.selection.main;
      const text = view.state.doc.sliceString(sel.from, sel.to);
      return { from: sel.from, to: sel.to, text };
    },
    replaceSelection: (text: string) => {
      const view = viewRef.current;
      if (!view) return;
      const sel = view.state.selection.main;
      view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text } });
    },
    replaceRange: (from: number, to: number, text: string) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ changes: { from, to, insert: text } });
    },
    setPinnedSelection: (range: { from: number; to: number } | null) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ effects: setPinnedSelectionEffect.of(range) });
    },
    getSelectionRect: () => {
      const view = viewRef.current;
      if (!view) return null;
      const sel = view.state.selection.main;
      return computeSelectionRect(view, sel.from, sel.to);
    }
  }));

  return <div className="editor" ref={containerRef} />;
});

export default Editor;
