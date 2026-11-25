import { readFileSync } from "node:fs";

const preview = readFileSync(new URL("../preview.png", import.meta.url));
if (!preview.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
  throw new Error("preview.png must be a PNG image");
}
