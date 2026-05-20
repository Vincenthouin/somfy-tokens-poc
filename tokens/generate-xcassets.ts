import * as fs from "fs";
import * as path from "path";

const TOKEN_FILE = path.join(__dirname, "somfy-tokens.json");
const OUTPUT_DIR = path.join(__dirname, "ColorsIntegration.xcassets");

// --- Types ---

interface ColorComponents {
  red: string;
  green: string;
  blue: string;
  alpha: string;
}

interface FlatToken {
  pathParts: string[];
  light: string;
  dark?: string;
}

// --- Color utilities ---

function hexToComponents(hex: string): ColorComponents {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 6) h += "FF";

  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const a = parseInt(h.slice(6, 8), 16) / 255;

  return {
    red: r.toFixed(3),
    green: g.toFixed(3),
    blue: b.toFixed(3),
    alpha: a.toFixed(3),
  };
}

function makeColorEntry(
  hex: string,
  appearances?: Array<{ appearance: string; value: string }>
) {
  const entry: Record<string, unknown> = {
    idiom: "universal",
    color: {
      "color-space": "srgb",
      components: hexToComponents(hex),
    },
  };
  if (appearances) entry.appearances = appearances;
  return entry;
}

function generateColorsetContents(light: string, dark?: string): object {
  const colors: unknown[] = [makeColorEntry(light)];
  if (dark) {
    colors.push(
      makeColorEntry(dark, [{ appearance: "luminosity", value: "dark" }])
    );
  }
  return {
    colors,
    info: { author: "xcode", version: 1 },
  };
}

// --- Token flattening ---

function flattenColorTokens(
  obj: Record<string, unknown>,
  pathParts: string[],
  tokens: FlatToken[] = []
): FlatToken[] {
  if (obj.$type === "color") {
    const value = obj.$value as Record<string, string> | string;
    const isDarkPlaceholder =
      (obj.$extensions as Record<string, unknown> | undefined)?.[
        "somfy.darkPlaceholder"
      ] === true;

    const light = typeof value === "string" ? value : value.light;
    const dark =
      !isDarkPlaceholder && typeof value !== "string" ? value.dark : undefined;

    // Skip tokens with empty light value
    if (!light) return tokens;

    const normalizedPath = pathParts.map((p) => (p === "_base" ? "base" : p));
    tokens.push({ pathParts: normalizedPath, light, dark: dark || undefined });
    return tokens;
  }

  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("$")) continue;
    flattenColorTokens(
      val as Record<string, unknown>,
      [...pathParts, key],
      tokens
    );
  }

  return tokens;
}

// --- xcassets writers ---

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function ensureFolderWithNamespace(folderPath: string): void {
  fs.mkdirSync(folderPath, { recursive: true });
  const contentsPath = path.join(folderPath, "Contents.json");
  if (!fs.existsSync(contentsPath)) {
    writeJson(contentsPath, {
      info: { author: "xcode", version: 1 },
      properties: { "provides-namespace": true },
    });
  }
}

function writeColorset(outputDir: string, token: FlatToken): void {
  const folderParts = token.pathParts.slice(0, -1);
  const colorsetName = token.pathParts.at(-1)!;

  // Ensure each intermediate folder has a namespace Contents.json
  let current = outputDir;
  for (const part of folderParts) {
    current = path.join(current, part);
    ensureFolderWithNamespace(current);
  }

  const colorsetPath = path.join(current, `${colorsetName}.colorset`);
  fs.mkdirSync(colorsetPath, { recursive: true });

  writeJson(
    path.join(colorsetPath, "Contents.json"),
    generateColorsetContents(token.light, token.dark)
  );
}

// --- Main ---

const json = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
const primitiveColors = (json.primitives as Record<string, unknown>)
  ?.loop as Record<string, unknown>;
const colorTokens = primitiveColors?.color as Record<string, unknown>;

if (!colorTokens) {
  console.error("No primitives.loop.color found in token file");
  process.exit(1);
}

// Clean and recreate output dir
if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true });
}
fs.mkdirSync(OUTPUT_DIR);
writeJson(path.join(OUTPUT_DIR, "Contents.json"), {
  info: { author: "xcode", version: 1 },
});

const tokens = flattenColorTokens(colorTokens, ["loop", "color"]);

for (const token of tokens) {
  writeColorset(OUTPUT_DIR, token);
}

const darkCount = tokens.filter((t) => t.dark).length;
console.log(`Generated ${tokens.length} colorsets (${darkCount} with dark variant) → ${OUTPUT_DIR}`);
