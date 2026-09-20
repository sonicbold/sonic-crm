"use client";
import * as React from "react";
import { ToastProps } from "./toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = ToastProps & { id: string; title?: React.ReactNode; description?: React.ReactNode };

let count = 0;
function genId() { count = (count + 1) % Number.MAX_SAFE_INTEGER; return count.toString(); }

type Action =
  | { type: "ADD_TOAST"; toast: ToasterToast }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string };

interface State { toasts: ToasterToast[] }

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_TOAST": return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case "DISMISS_TOAST": {
      const { toastId } = action;
      if (toastId) {
        if (!toastTimeouts.has(toastId)) {
          toastTimeouts.set(toastId, setTimeout(() => { dispatch({ type: "REMOVE_TOAST", toastId }); }, TOAST_REMOVE_DELAY));
        }
      } else {
        state.toasts.forEach((t) => { dispatch({ type: "DISMISS_TOAST", toastId: t.id }); });
      }
      return { ...state, toasts: state.toasts.map((t) => toastId === undefined || t.id === toastId ? { ...t, open: false } : t) };
    }
    case "REMOVE_TOAST": return { ...state, toasts: action.toastId ? state.toasts.filter((t) => t.id !== action.toastId) : [] };
    default: return state;
  }
}

const listeners: Array<(s: State) => void> = [];
let memoryState: State = { toasts: [] };
function dispatch(action: Action) { memoryState = reducer(memoryState, action); listeners.forEach((l) => l(memoryState)); }

function toast(props: Omit<ToasterToast, "id">) {
  const id = genId();
  dispatch({ type: "ADD_TOAST", toast: { ...props, id, open: true, onOpenChange: (open) => { if (!open) dispatch({ type: "DISMISS_TOAST", toastId: id }); } } });
  return { id, dismiss: () => dispatch({ type: "DISMISS_TOAST", toastId: id }) };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);
  React.useEffect(() => { listeners.push(setState); return () => { const idx = listeners.indexOf(setState); if (idx > -1) listeners.splice(idx, 1); }; }, []);
  return { ...state, toast, dismiss: (id?: string) => dispatch({ type: "DISMISS_TOAST", toastId: id }) };
}

export { useToast, toast };
