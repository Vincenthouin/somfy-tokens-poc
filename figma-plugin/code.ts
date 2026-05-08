// ============================================================
// Somfy Token Sync - V1 complete
// Supports: color, dimension, number, fontWeight, fontFamily,
//           typography (Text Styles), shadow (Effect Styles)
// ============================================================

figma.showUI(__html__, { width: 420, height: 600, themeColors: true });

interface FlatToken {
  path: string;
  type: string;
  value: any;
  isPlaceholder: boolean;
}

interface Diff {
  kind: "added" | "modified" | "removed";
  path: string;
  type: string;
  oldValue?: any;
  newValue?: any;
}

let cachedTokens: FlatToken[] = [];
let cachedTokenTree: any = null; // raw JSON for alias resolution

const SUPPORTED_VAR_TYPES = new Set(["color", "dimension", "number", "fontWeight", "fontFamily"]);
const SUPPORTED_STYLE_TYPES = new Set(["typography", "shadow"]);

// Mapping from numeric font weights to Figma font style names
const WEIGHT_TO_STYLE: { [key: number]: string } = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black"
};

// ---------- Storage ----------
async function loadConfig() {
  const config = await figma.clientStorage.getAsync("config");
  return config || { token: "", owner: "", repo: "", branch: "main", filePath: "" };
}

async function saveConfig(config: any) {
  await figma.clientStorage.setAsync("config", config);
}

// ---------- Token tree flattening ----------
function flattenTokens(node: any, prefix: string[] = []): FlatToken[] {
  const out: FlatToken[] = [];
  if (!node || typeof node !== "object") return out;

  if ("$value" in node) {
    out.push({
      path: prefix.join("."),
      type: node.$type || "unknown",
      value: node.$value,
      isPlaceholder: !!(node.$extensions && node.$extensions["somfy.darkPlaceholder"])
    });
    return out;
  }

  for (const key in node) {
    if (key.startsWith("$")) continue;
    out.push(...flattenTokens(node[key], [...prefix, key]));
  }
  return out;
}

// ---------- Alias resolution ----------
// Resolve "{primitives.loop.font.family}" by walking the token tree
function resolveAlias(value: any, tree: any): any {
  if (typeof value !== "string") return value;
  const match = value.match(/^\{([^}]+)\}$/);
  if (!match) return value;
  const path = match[1].split(".");
  let cur = tree;
  for (const seg of path) {
    if (!cur || typeof cur !== "object") return value;
    cur = cur[seg];
  }
  if (cur && typeof cur === "object" && "$value" in cur) {
    return cur.$value;
  }
  return value;
}

function resolveTokenValue(token: FlatToken, tree: any): any {
  const v = token.value;
  if (token.type === "typography" && v && typeof v === "object") {
    const resolved: any = {};
    for (const key in v) {
      resolved[key] = resolveAlias(v[key], tree);
    }
    return resolved;
  }
  return resolveAlias(v, tree);
}

// ---------- Color/dimension helpers ----------
function hexToRgb(hex: string): { r: number; g: number; b: number; a: number } {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  let a = 1;
  if (h.length === 8) {
    a = parseInt(h.slice(6, 8), 16) / 255;
    h = h.slice(0, 6);
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return { r, g, b, a };
}

function parseDimension(v: any): number {
  if (typeof v === "number") return v;
  return parseFloat(String(v).replace("px", "").trim()) || 0;
}

function rgbToHex(rgb: any): string {
  if (!rgb || typeof rgb !== "object") return "";
  const to255 = (v: number) => Math.round(v * 255);
  const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  const r = hex(to255(rgb.r || 0));
  const g = hex(to255(rgb.g || 0));
  const b = hex(to255(rgb.b || 0));
  if (typeof rgb.a === "number" && rgb.a < 1) {
    const a = hex(Math.round(rgb.a * 255));
    return `#${r}${g}${b}${a}`;
  }
  return `#${r}${g}${b}`;
}

function normalizeColor(v: any): string {
  if (typeof v === "string") return v.toUpperCase().trim();
  if (v && typeof v === "object" && "r" in v) return rgbToHex(v);
  return "";
}

// ---------- Path / name conversion ----------
function tokenPathToFigmaName(path: string): string {
  return path
    .split(".")
    .map(seg => seg === "_base" ? "base" : seg)
    .join("/");
}

function styleNameFromPath(path: string): string {
  // composite.loop.typography.title-soft -> Loop / Typography / Title / Soft
  // primitives.loop.shadow.100 -> Loop / Shadow / 100
  const parts = path.split(".").slice(1); // drop "composite" or "primitives"
  return parts
    .map(p => p.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "))
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" / ");
}

// ---------- Read existing Figma state ----------
async function readFigmaVariables(): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const collection of collections) {
    if (collection.name !== "Somfy Tokens") continue;
    for (const varId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (!variable) continue;
      const valuesCopy: any = {};
      for (const modeId in variable.valuesByMode) {
        valuesCopy[modeId] = variable.valuesByMode[modeId];
      }
      const dotPath = variable.name.replace(/\//g, ".").replace(/\bbase\b/g, "_base");
      map.set(dotPath, {
        type: variable.resolvedType.toLowerCase(),
        values: valuesCopy,
        id: variable.id,
        collectionId: collection.id
      });
    }
  }
  return map;
}

async function readFigmaTextStyles(): Promise<Map<string, TextStyle>> {
  const map = new Map<string, TextStyle>();
  const styles = await figma.getLocalTextStylesAsync();
  for (const s of styles) map.set(s.name, s);
  return map;
}

async function readFigmaEffectStyles(): Promise<Map<string, EffectStyle>> {
  const map = new Map<string, EffectStyle>();
  const styles = await figma.getLocalEffectStylesAsync();
  for (const s of styles) map.set(s.name, s);
  return map;
}

// ---------- Diff helpers ----------
function isEmptyValue(token: FlatToken): boolean {
  const v = token.value;
  if (v === null || v === undefined || v === "") return true;
  if (token.type === "color" && v && typeof v === "object" && "light" in v) {
    return !v.light && !v.dark;
  }
  return false;
}

function buildRemoteSnapshot(token: FlatToken): string {
  if (token.type === "color") {
    const v = token.value;
    if (v && typeof v === "object" && "light" in v) {
      return `L:${normalizeColor(v.light)}|D:${normalizeColor(v.dark)}`;
    }
    return `L:${normalizeColor(v)}`;
  }
  if (token.type === "dimension") {
    const n = parseDimension(token.value);
    return `${Math.round(n * 10000) / 10000}`;
  }
  if (token.type === "number" || token.type === "fontWeight") {
    const n = Number(token.value);
    return `${Math.round(n * 10000) / 10000}`;
  }
  if (token.type === "fontFamily") {
    const v = Array.isArray(token.value) ? token.value[0] : token.value;
    return String(v);
  }
  return JSON.stringify(token.value);
}

function buildLocalSnapshot(local: any, type: string, lightId: string, darkId: string): string {
  // type here is the REMOTE token type (from JSON): color, dimension, number, fontWeight, fontFamily
  if (type === "color") {
    return `L:${normalizeColor(local.values[lightId])}|D:${normalizeColor(local.values[darkId])}`;
  }
  if (type === "dimension" || type === "number" || type === "fontWeight") {
    const v = local.values[lightId];
    // Round to 4 decimals to neutralize float32 precision (1.2000000476837158 -> 1.2)
    const num = typeof v === "number" ? Math.round(v * 10000) / 10000 : 0;
    return `${num}`;
  }
  if (type === "fontFamily") {
    const v = local.values[lightId];
    return String(v || "");
  }
  return JSON.stringify(local.values);
}

function computeDiffs(
  remoteTokens: FlatToken[],
  localMap: Map<string, any>,
  textStyles: Map<string, TextStyle>,
  effectStyles: Map<string, EffectStyle>,
  lightModeId: string,
  darkModeId: string
): Diff[] {
  const diffs: Diff[] = [];
  const seen = new Set<string>();

  for (const token of remoteTokens) {
    seen.add(token.path);
    if (isEmptyValue(token)) continue;

    if (SUPPORTED_VAR_TYPES.has(token.type)) {
      const local = localMap.get(token.path);
      if (!local) {
        diffs.push({ kind: "added", path: token.path, type: token.type, newValue: token.value });
      } else {
        const localSnapshot = buildLocalSnapshot(local, token.type, lightModeId, darkModeId);
        const remoteSnapshot = buildRemoteSnapshot(token);
        if (localSnapshot !== remoteSnapshot) {
          diffs.push({ kind: "modified", path: token.path, type: token.type, oldValue: local.values, newValue: token.value });
        }
      }
    } else if (token.type === "typography") {
      const styleName = styleNameFromPath(token.path);
      if (!textStyles.has(styleName)) {
        diffs.push({ kind: "added", path: token.path, type: token.type, newValue: token.value });
      }
      // Note: deep diff for typography not implemented yet (would require resolving all aliases)
    } else if (token.type === "shadow") {
      const styleName = styleNameFromPath(token.path);
      if (!effectStyles.has(styleName)) {
        diffs.push({ kind: "added", path: token.path, type: token.type, newValue: token.value });
      }
    }
  }

  for (const path of localMap.keys()) {
    if (!seen.has(path)) {
      const local = localMap.get(path)!;
      diffs.push({ kind: "removed", path, type: local.type, oldValue: local.values });
    }
  }

  return diffs;
}

// ---------- Variable creation ----------
async function getOrCreateCollection() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  let collection = collections.find(c => c.name === "Somfy Tokens");
  if (!collection) {
    collection = figma.variables.createVariableCollection("Somfy Tokens");
    try { collection.renameMode(collection.modes[0].modeId, "Light"); } catch (e) {}
    try { collection.addMode("Dark"); } catch (e) {}
  }
  return collection;
}

async function applyVariables(tokens: FlatToken[], onProgress: (msg: string) => void): Promise<{ count: number, skipped: number, errors: string[], byPath: Map<string, Variable> }> {
  const collection = await getOrCreateCollection();
  const lightMode = collection.modes.find(m => m.name === "Light") || collection.modes[0];
  let darkMode = collection.modes.find(m => m.name === "Dark");
  if (!darkMode) {
    try {
      const id = collection.addMode("Dark");
      darkMode = collection.modes.find(m => m.modeId === id);
    } catch (e) {}
  }

  const existing = await figma.variables.getLocalVariablesAsync();
  const byName = new Map<string, Variable>();
  const byPath = new Map<string, Variable>();
  for (const v of existing) {
    if (v.variableCollectionId === collection.id) {
      byName.set(v.name, v);
      const dotPath = v.name.replace(/\//g, ".").replace(/\bbase\b/g, "_base");
      byPath.set(dotPath, v);
    }
  }

  let count = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const token of tokens) {
    try {
      if (!SUPPORTED_VAR_TYPES.has(token.type)) { skipped++; continue; }
      if (isEmptyValue(token)) { skipped++; continue; }

      let figmaType: VariableResolvedDataType;
      switch (token.type) {
        case "color": figmaType = "COLOR"; break;
        case "dimension":
        case "number":
        case "fontWeight": figmaType = "FLOAT"; break;
        case "fontFamily": figmaType = "STRING"; break;
        default: skipped++; continue;
      }

      const figmaName = tokenPathToFigmaName(token.path);
      let variable = byName.get(figmaName);
      if (!variable) {
        variable = figma.variables.createVariable(figmaName, collection, figmaType);
        byName.set(figmaName, variable);
        byPath.set(token.path, variable);
      }

      if (token.type === "color") {
        const val = token.value;
        if (val && typeof val === "object" && "light" in val) {
          if (val.light && typeof val.light === "string" && val.light.startsWith("#")) {
            variable.setValueForMode(lightMode.modeId, hexToRgb(val.light));
          }
          if (val.dark && darkMode && typeof val.dark === "string" && val.dark.startsWith("#")) {
            variable.setValueForMode(darkMode.modeId, hexToRgb(val.dark));
          }
        } else if (typeof val === "string" && val.startsWith("#")) {
          variable.setValueForMode(lightMode.modeId, hexToRgb(val));
        }
      } else if (token.type === "dimension") {
        variable.setValueForMode(lightMode.modeId, parseDimension(token.value));
      } else if (token.type === "number" || token.type === "fontWeight") {
        variable.setValueForMode(lightMode.modeId, Number(token.value));
      } else if (token.type === "fontFamily") {
        const v = Array.isArray(token.value) ? token.value[0] : token.value;
        variable.setValueForMode(lightMode.modeId, String(v));
      }

      count++;
      if (count % 20 === 0) onProgress(`Variables: ${count}/${tokens.length}…`);
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err);
      console.error(`Failed for ${token.path}:`, msg);
      if (errors.length < 5) errors.push(`${token.path} (${token.type}): ${msg}`);
    }
  }
  return { count, skipped, errors, byPath };
}

// ---------- Text Styles (typography) ----------
async function applyTextStyles(
  typographyTokens: FlatToken[],
  tree: any,
  variablesByPath: Map<string, Variable>,
  onProgress: (msg: string) => void
): Promise<{ count: number, errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  const existing = await figma.getLocalTextStylesAsync();
  const byName = new Map(existing.map(s => [s.name, s]));

  // Pre-load all unique fonts we'll need
  const fontsToLoad = new Set<string>();
  for (const token of typographyTokens) {
    const v = token.value;
    if (!v || typeof v !== "object") continue;
    const family = resolveAlias(v.fontFamily, tree);
    const weight = resolveAlias(v.fontWeight, tree);
    const familyName = Array.isArray(family) ? family[0] : family;
    const styleName = WEIGHT_TO_STYLE[Number(weight)] || "Regular";
    if (familyName) fontsToLoad.add(`${familyName}|||${styleName}`);
  }

  for (const fontKey of fontsToLoad) {
    const [family, style] = fontKey.split("|||");
    try {
      await figma.loadFontAsync({ family, style });
    } catch (e) {
      console.warn(`Could not load font ${family} ${style}, will fallback`);
    }
  }

  for (const token of typographyTokens) {
    try {
      const v = token.value;
      if (!v || typeof v !== "object") continue;

      const styleName = styleNameFromPath(token.path);
      let textStyle = byName.get(styleName);
      if (!textStyle) {
        textStyle = figma.createTextStyle();
        textStyle.name = styleName;
        byName.set(styleName, textStyle);
      }

      // Resolve concrete values for fontFamily + fontWeight (combined into fontName)
      const family = resolveAlias(v.fontFamily, tree);
      const weight = resolveAlias(v.fontWeight, tree);
      const familyName = Array.isArray(family) ? family[0] : String(family);
      const fontStyleName = WEIGHT_TO_STYLE[Number(weight)] || "Regular";

      try {
        textStyle.fontName = { family: familyName, style: fontStyleName };
      } catch (e: any) {
        // Fallback to Regular if specific weight is unavailable
        try {
          await figma.loadFontAsync({ family: familyName, style: "Regular" });
          textStyle.fontName = { family: familyName, style: "Regular" };
        } catch (e2) {
          throw new Error(`Font unavailable: ${familyName} ${fontStyleName}`);
        }
      }

      // Bind fontSize to variable if alias, otherwise use concrete value
      const sizeRefMatch = typeof v.fontSize === "string" ? v.fontSize.match(/^\{([^}]+)\}$/) : null;
      if (sizeRefMatch) {
        const sizeVar = variablesByPath.get(sizeRefMatch[1]);
        if (sizeVar) {
          textStyle.setBoundVariable("fontSize", sizeVar);
        } else {
          textStyle.fontSize = parseDimension(resolveAlias(v.fontSize, tree));
        }
      } else {
        textStyle.fontSize = parseDimension(v.fontSize);
      }

      // lineHeight: in our JSON it's a unitless ratio (1.35). Figma expects PERCENT.
      const lhRaw = resolveAlias(v.lineHeight, tree);
      const lhPercent = typeof lhRaw === "number" ? lhRaw * 100 : parseFloat(String(lhRaw)) * 100;
      if (!isNaN(lhPercent) && lhPercent > 0) {
        textStyle.lineHeight = { unit: "PERCENT", value: lhPercent };
      }

      count++;
      onProgress(`Text Styles: ${count}/${typographyTokens.length}…`);
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err);
      console.error(`Text style failed for ${token.path}:`, msg);
      if (errors.length < 5) errors.push(`${token.path}: ${msg}`);
    }
  }
  return { count, errors };
}

// ---------- Effect Styles (shadows) ----------
async function applyEffectStyles(
  shadowTokens: FlatToken[],
  onProgress: (msg: string) => void
): Promise<{ count: number, errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  const existing = await figma.getLocalEffectStylesAsync();
  const byName = new Map(existing.map(s => [s.name, s]));

  for (const token of shadowTokens) {
    try {
      const v = token.value;
      if (!v || typeof v !== "object") continue;

      const styleName = styleNameFromPath(token.path);
      let effectStyle = byName.get(styleName);
      if (!effectStyle) {
        effectStyle = figma.createEffectStyle();
        effectStyle.name = styleName;
        byName.set(styleName, effectStyle);
      }

      // Use light color for the effect (Figma effects don't support modes)
      const colorObj = v.color || {};
      const colorHex = typeof colorObj === "object" && "light" in colorObj
        ? colorObj.light
        : (typeof colorObj === "string" ? colorObj : "#000000");

      const rgba = colorHex && typeof colorHex === "string" && colorHex.startsWith("#")
        ? hexToRgb(colorHex)
        : { r: 0, g: 0, b: 0, a: 1 };

      const opacity = typeof v.opacity === "number" ? v.opacity : 1;

      const effect: DropShadowEffect = {
        type: "DROP_SHADOW",
        color: { r: rgba.r, g: rgba.g, b: rgba.b, a: opacity },
        offset: { x: parseDimension(v.offsetX), y: parseDimension(v.offsetY) },
        radius: parseDimension(v.blur),
        spread: parseDimension(v.spread),
        visible: true,
        blendMode: "NORMAL"
      };

      effectStyle.effects = [effect];
      count++;
      onProgress(`Effect Styles: ${count}/${shadowTokens.length}…`);
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err);
      console.error(`Effect style failed for ${token.path}:`, msg);
      if (errors.length < 5) errors.push(`${token.path}: ${msg}`);
    }
  }
  return { count, errors };
}

// ---------- Main message handler ----------
figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === "load-config") {
      const config = await loadConfig();
      const lastSyncedSha = await figma.clientStorage.getAsync("lastSyncedSha");
      const pollInterval = await figma.clientStorage.getAsync("pollInterval");
      // Détecte si une collection Somfy existe déjà (= sync précédent)
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const hasExistingCollection = collections.some(c => c.name === "Somfy Tokens");
      figma.ui.postMessage({
        type: "config-loaded",
        config,
        lastSyncedSha,
        hasExistingCollection,
        pollInterval
      });
    }

    else if (msg.type === "save-config") {
      await saveConfig(msg.config);
      figma.ui.postMessage({ type: "config-saved" });
    }

    else if (msg.type === "save-synced-sha") {
      await figma.clientStorage.setAsync("lastSyncedSha", msg.sha);
    }

    else if (msg.type === "save-poll-interval") {
      await figma.clientStorage.setAsync("pollInterval", msg.interval);
    }

    else if (msg.type === "tokens-fetched") {
      const tokens = flattenTokens(msg.json);
      cachedTokens = tokens;
      cachedTokenTree = msg.json;

      const localMap = await readFigmaVariables();
      const textStyles = await readFigmaTextStyles();
      const effectStyles = await readFigmaEffectStyles();

      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const collection = collections.find(c => c.name === "Somfy Tokens");
      const lightModeId = collection ? (collection.modes.find(m => m.name === "Light")?.modeId || collection.modes[0]?.modeId || "") : "";
      const darkModeId = collection ? (collection.modes.find(m => m.name === "Dark")?.modeId || "") : "";

      const diffs = computeDiffs(tokens, localMap, textStyles, effectStyles, lightModeId, darkModeId);
      figma.ui.postMessage({
        type: "diffs-computed",
        diffs,
        totalTokens: tokens.length,
        placeholders: tokens.filter(t => t.isPlaceholder).length
      });
    }

    else if (msg.type === "apply-tokens") {
      if (cachedTokens.length === 0) {
        figma.ui.postMessage({ type: "error", message: "No tokens cached. Click 'Check for updates' first." });
        return;
      }

      const allErrors: string[] = [];
      let totalCount = 0;
      let totalSkipped = 0;

      // 1. Variables (primitives + simple component tokens)
      figma.ui.postMessage({ type: "progress", message: "Applying Variables…" });
      const varResult = await applyVariables(cachedTokens, (m) =>
        figma.ui.postMessage({ type: "progress", message: m })
      );
      totalCount += varResult.count;
      totalSkipped += varResult.skipped;
      allErrors.push(...varResult.errors);

      // 2. Text Styles (typography composites)
      const typographyTokens = cachedTokens.filter(t => t.type === "typography");
      if (typographyTokens.length > 0) {
        figma.ui.postMessage({ type: "progress", message: "Creating Text Styles…" });
        const tsResult = await applyTextStyles(typographyTokens, cachedTokenTree, varResult.byPath, (m) =>
          figma.ui.postMessage({ type: "progress", message: m })
        );
        totalCount += tsResult.count;
        allErrors.push(...tsResult.errors);
      }

      // 3. Effect Styles (shadows)
      const shadowTokens = cachedTokens.filter(t => t.type === "shadow");
      if (shadowTokens.length > 0) {
        figma.ui.postMessage({ type: "progress", message: "Creating Effect Styles…" });
        const esResult = await applyEffectStyles(shadowTokens, (m) =>
          figma.ui.postMessage({ type: "progress", message: m })
        );
        totalCount += esResult.count;
        allErrors.push(...esResult.errors);
      }

      figma.ui.postMessage({
        type: "apply-done",
        count: totalCount,
        skipped: totalSkipped,
        errors: allErrors.slice(0, 5)
      });
      figma.notify(`✓ Synced ${totalCount} tokens (${totalSkipped} skipped)`);
    }

    else if (msg.type === "close") {
      figma.closePlugin();
    }
  } catch (err: any) {
    const message = err && err.message ? err.message : String(err);
    console.error("Plugin error:", err);
    figma.ui.postMessage({ type: "error", message });
  }
};
