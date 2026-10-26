import { requireThat } from "./safe.mjs";

export async function hiddenPassphrase(label = "Backup passphrase (not displayed): ", input = process.stdin, output = process.stdout) {
  requireThat(input.isTTY && output.isTTY && typeof input.setRawMode === "function", "private_terminal_required");
  output.write(label); input.setRawMode(true); input.resume(); input.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    function finish(error) { input.removeListener("data", data); input.setRawMode(false); input.pause(); output.write("\n"); if (error) reject(new Error(error)); else resolve(value); value = ""; }
    function data(chunk) {
      for (const ch of chunk) {
        if (ch === "\u0003" || ch === "\u0004") { finish("cancelled"); return; }
        if (ch === "\r" || ch === "\n") { if (value.length < 20) finish("passphrase_required"); else finish(); return; }
        if (ch === "\u007f" || ch === "\b") value = [...value].slice(0, -1).join("");
        else if (ch >= " " && value.length < 512) value += ch;
      }
    }
    input.on("data", data);
  });
}
