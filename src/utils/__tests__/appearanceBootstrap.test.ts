import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
const bootstrap = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][1][1];
const removed = ["diagnostic", "clearsky", "slate", "slate-light", "glacier", "orbital", "system", "light", "dark", "aurora", "luminous", "cupertino", "cupertino-dark", "cupertino-dense"];

function firstPaint(appearance: string | null, fallback: string | null) {
  const values = new Map<string, string>();
  if (appearance !== null) values.set("appearance", appearance);
  if (fallback !== null) values.set("appearance_default", fallback);
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
  const meta = { content: "" };
  runInNewContext(bootstrap, {
    localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
    document: { documentElement: root, querySelector: () => meta },
  });
  return { root, meta };
}

describe("appearance before first paint", () => {
  it.each(removed)("ignores removed %s preferences", (appearance) => {
    for (const stored of [appearance, JSON.stringify(appearance)]) {
      expect(firstPaint(stored, '"crystal-dark"').root.dataset.themeStyle).toBe("crystal-dark");
      expect(firstPaint(stored, stored).root.dataset.themeStyle).toBe("crystal-light");
    }
  });

  it.each([["light", "#edf3fc"], ["dark", "#0b111c"]])("applies the crystal %s palette", (scheme, color) => {
    const appearance = `crystal-${scheme}`;
    for (const [stored, cached] of [[JSON.stringify(appearance), null], [null, appearance]]) {
      const { root, meta } = firstPaint(stored, cached);
      expect(root.dataset).toEqual({ appearance: scheme, themeStyle: appearance, layoutStyle: "cupertino" });
      expect(root.style.colorScheme).toBe(scheme);
      expect(meta.content).toBe(color);
    }
  });
});
