import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Minimal portal so overlays (AppModal) render at the app root — ABOVE the
 * navigator and its bottom tab bar — instead of inside the screen that opened
 * them. This is what lets a backdrop cover the whole window without the native
 * <Modal> subsystem, which renders off-screen on some Android OEMs with this
 * app's edge-to-edge status bar (see AddTaskScreen's notes).
 *
 * Loop-safety: `mount`/`unmount` and the context value are stable (useCallback/
 * useMemo), and PortalProvider's `children` is a stable element created once in
 * App.tsx — so when a portal entry changes, React bails out of re-rendering the
 * whole navigator subtree, and only the overlay layer updates. No render loop.
 */

interface PortalEntry {
  id: number;
  node: React.ReactNode;
}
interface PortalApi {
  mount: (id: number, node: React.ReactNode) => void;
  unmount: (id: number) => void;
}

const PortalContext = createContext<PortalApi | null>(null);

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<PortalEntry[]>([]);

  const mount = useCallback((id: number, node: React.ReactNode) => {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      if (idx === -1) return [...prev, { id, node }];
      const next = prev.slice();
      next[idx] = { id, node };
      return next;
    });
  }, []);

  const unmount = useCallback((id: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const api = useMemo<PortalApi>(() => ({ mount, unmount }), [mount, unmount]);

  return (
    <PortalContext.Provider value={api}>
      {children}
      {entries.length > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {entries.map((e) => (
            <React.Fragment key={e.id}>{e.node}</React.Fragment>
          ))}
        </View>
      )}
    </PortalContext.Provider>
  );
}

let counter = 0;

/** Render `children` into the app-root overlay layer. Renders nothing in place. */
export function Portal({ children }: { children: React.ReactNode }) {
  const api = useContext(PortalContext);
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = ++counter;

  // Keep the portaled node in sync with each render of this component.
  useEffect(() => {
    api?.mount(idRef.current, children);
  });

  // Remove the entry when this Portal unmounts.
  useEffect(() => {
    const id = idRef.current;
    return () => api?.unmount(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback: with no provider mounted, render in place rather than vanish.
  return api ? null : <>{children}</>;
}
