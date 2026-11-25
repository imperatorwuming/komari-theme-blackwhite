import { notifyPaletteChanged } from "@/utils/palette";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { isAppearance, isDarkAppearance, type Appearance } from "@/utils/themeSettings";

type ResolvedAppearance = "light" | "dark";
const APPEARANCE_STORAGE_KEY = "appearance";
const APPEARANCE_DEFAULT_STORAGE_KEY = "appearance_default";

interface PrefsState {
  appearance: Appearance;
  resolvedAppearance: ResolvedAppearance;
}

const DEFAULTS: PrefsState = {
  appearance: "crystal-light",
  resolvedAppearance: "light",
};

let themeFlipTimer: number | null = null;
let hasExplicitAppearancePreference = false;
function parseStoredAppearance(raw: string | null): Appearance | null {
  if (raw == null) {
    return null;
  }

  if (isAppearance(raw)) {
    return raw;
  }

  try {
    const parsed = JSON.parse(raw);
    return isAppearance(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 持久化存储不可用时，保留内存里的 preference。
  }
}

function readStoredAppearance() {
  const parsed = parseStoredAppearance(readStorageItem(APPEARANCE_STORAGE_KEY));
  const fallback =
    parseStoredAppearance(readStorageItem(APPEARANCE_DEFAULT_STORAGE_KEY)) ??
    DEFAULTS.appearance;
  return {
    appearance: parsed ?? fallback,
    hasExplicitPreference: parsed != null,
  };
}

function persistAppearance(value: Appearance) {
  // 存成 JSON 字符串，以兼容会解析这个 key 的旧主题包。
  writeStorageItem(APPEARANCE_STORAGE_KEY, JSON.stringify(value));
}

let lastPersistedDefault: Appearance | null = null;
function persistDefaultAppearance(value: Appearance) {
  if (lastPersistedDefault === value) return;
  lastPersistedDefault = value;
  writeStorageItem(APPEARANCE_DEFAULT_STORAGE_KEY, JSON.stringify(value));
}

const listeners = new Set<() => void>();
let snapshot: PrefsState = { ...DEFAULTS };

function emit() {
  for (const l of listeners) l();
}

function markThemeFlip() {
  const root = document.documentElement;
  root.classList.add("theme-flip");
  if (themeFlipTimer != null) {
    window.clearTimeout(themeFlipTimer);
  }
  themeFlipTimer = window.setTimeout(() => {
    root.classList.remove("theme-flip");
    themeFlipTimer = null;
  }, 140);
}

function applyAppearance(appearance: Appearance, resolvedAppearance: ResolvedAppearance) {
  const root = document.documentElement;
  const previous = `${root.dataset.appearance}:${root.dataset.themeStyle}`;
  root.dataset.appearance = resolvedAppearance;
  root.dataset.themeStyle = appearance;
  root.dataset.layoutStyle = "cupertino";
  root.style.colorScheme = resolvedAppearance;
  if (previous !== `${root.dataset.appearance}:${root.dataset.themeStyle}`) notifyPaletteChanged();
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = isDarkAppearance(appearance) ? "#0b111c" : "#edf3fc";
  }
}

function commit(next: Partial<PrefsState>) {
  const merged: PrefsState = { ...snapshot, ...next };
  if (next.appearance) {
    merged.resolvedAppearance = isDarkAppearance(merged.appearance) ? "dark" : "light";
  }
  if (
    snapshot.resolvedAppearance === merged.resolvedAppearance &&
    snapshot.appearance === merged.appearance
  ) return;
  markThemeFlip();
  snapshot = merged;
  applyAppearance(merged.appearance, merged.resolvedAppearance);
  emit();
}

// 在模块加载时（React 渲染之前）初始化，让持久化的 appearance 在首帧之前就落到
// <html>，以免在 React 渲染时闪烁。未手动选择时使用服务端设置。
function initializeAppearance() {
  const stored = readStoredAppearance();
  hasExplicitAppearancePreference = stored.hasExplicitPreference;
  if (stored.hasExplicitPreference) {
    persistAppearance(stored.appearance);
  }
  snapshot = {
    appearance: stored.appearance,
    resolvedAppearance: isDarkAppearance(stored.appearance) ? "dark" : "light",
  };
  applyAppearance(snapshot.appearance, snapshot.resolvedAppearance);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initializeAppearance();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

function getSnapshot() {
  return snapshot;
}

export function usePreferences() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const themeSettings = useThemeSettings();

  useEffect(() => {
    if (!themeSettings.isReady) return;
    if (hasExplicitAppearancePreference) return;
    const defaultAppearance = themeSettings.defaultAppearance;
    persistDefaultAppearance(defaultAppearance);
    commit({ appearance: defaultAppearance });
  }, [themeSettings.defaultAppearance, themeSettings.isReady]);

  const setAppearance = useCallback((a: Appearance) => {
    hasExplicitAppearancePreference = true;
    persistAppearance(a);
    commit({ appearance: a });
  }, []);

  return {
    appearance: state.appearance,
    resolvedAppearance: state.resolvedAppearance,
    setAppearance,
  };
}
