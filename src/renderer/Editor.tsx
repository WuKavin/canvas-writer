import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";

export type EditorHandle = {
  getValue: () => string;
  setValue: (value: string) => void;
  getSelection: () => { from: number; to: number; text: string };
  replaceSelection: (text: string) => void;
  replaceRange: (from: number, to: number, text: string) => void;
  getSelectionRect: () => { left: number; top: number; bottom: number } | null;
};

type EditorProps = {
  initialValue: string;
  onChange: (value: string) => void;
  onSelectionChange: (text: string, rect: { left: number; top: number; bottom: number } | null) => void;
};

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
              const fromRect = update.view.coordsAtPos(sel.from);
              const toRect = update.view.coordsAtPos(sel.to);
              if (fromRect && toRect) {
                const left = Math.min(fromRect.left, toRect.left);
                const top = Math.min(fromRect.top, toRect.top);
                const bottom = Math.max(fromRect.bottom, toRect.bottom);
                onSelectionRef.current(text, { left, top, bottom });
              } else {
                onSelectionRef.current(text, null);
              }
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
    getSelectionRect: () => {
      const view = viewRef.current;
      if (!view) return null;
      const sel = view.state.selection.main;
      if (sel.from === sel.to) return null;
      const fromRect = view.coordsAtPos(sel.from);
      const toRect = view.coordsAtPos(sel.to);
      if (!fromRect || !toRect) return null;
      const left = Math.min(fromRect.left, toRect.left);
      const top = Math.min(fromRect.top, toRect.top);
      const bottom = Math.max(fromRect.bottom, toRect.bottom);
      return { left, top, bottom };
    }
  }));

  return <div className="editor" ref={containerRef} />;
});

export default Editor;
