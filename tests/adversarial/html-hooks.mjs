import { readFileSync } from "node:fs";
export async function load(url, ctx, next) {
  if (url.endsWith(".html")) return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(readFileSync(new URL(url), "utf8")) };
  return next(url, ctx);
}
