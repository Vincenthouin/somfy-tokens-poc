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

interface DriftItem {
  path: string;
  type: string;
  reason?: "modified" | "renamed" | "deleted";
  figmaValue?: any;
  expectedValue?: any;
  figmaName?: string | null;
  expectedName?: string;
}

let cachedTokens: FlatToken[] = [];
let cachedTokenTree: any = null; // raw JSON for alias resolution

const SUPPORTED_VAR_TYPES = new Set(["color", "dimension", "number", "fontWeight", "fontFamily"]);
const SUPPORTED_STYLE_TYPES = new Set(["typography", "shadow"]);
const SNAPSHOT_KEY = "lastAppliedSnapshotV2"; // bump invalidates older formats

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
    a = Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100) / 100;
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

// Convertit local.values (Figma valuesByMode) en format comparable à newValue côté UI.
// Color → { light: "#hex", dark: "#hex" } ou "#hex" pour single-mode
// Number/dimension/fontWeight → number
// Autres → la valeur brute du mode light
function normalizeOldValue(local: any, type: string, lightId: string, darkId: string): any {
  if (!local || !local.values) return null;
  if (type === "color") {
    const lightHex = normalizeColor(local.values[lightId]);
    const darkRaw = local.values[darkId];
    if (darkRaw !== undefined && darkRaw !== null) {
      return { light: lightHex, dark: normalizeColor(darkRaw) };
    }
    return lightHex;
  }
  if (type === "dimension" || type === "number" || type === "fontWeight") {
    const v = local.values[lightId];
    return typeof v === "number" ? Math.round(v * 10000) / 10000 : v;
  }
  return local.values[lightId];
}

// ---------- Snapshot (desync detection) ----------
// Le snapshot reflète l'état réel de Figma après l'Apply (pas ce que dit le JSON),
// car certaines valeurs sont transformées : alpha de shadow stocké dans opacity,
// fallback de fontStyle quand un weight n'est pas installé, etc.
async function saveAppliedSnapshot(tokens: FlatToken[], _tree: any) {
  await pagesReady;
  const snapshot: { [path: string]: { type: string; value: any; figmaId?: string } } = {};

  // Variables : valeurs JSON + ID Figma pour tracking par ID (résiste aux renames)
  const localVarsByPath = await readFigmaVariables();
  for (const token of tokens) {
    if (isEmptyValue(token)) continue;
    if (SUPPORTED_VAR_TYPES.has(token.type)) {
      const local = localVarsByPath.get(token.path);
      snapshot[token.path] = { type: token.type, value: token.value, figmaId: local?.id };
    }
  }

  // Text Styles : on relit l'état réel Figma (lookup par nom normalisé) + ID
  const textStyles = await figma.getLocalTextStylesAsync();
  const textStylesByName = new Map(textStyles.map(s => [normalizeStyleName(s.name), s]));
  for (const token of tokens) {
    if (token.type !== "typography" || isEmptyValue(token)) continue;
    const styleName = normalizeStyleName(styleNameFromPath(token.path));
    const style = textStylesByName.get(styleName);
    if (style) {
      snapshot[token.path] = { type: "typography", value: readTextStyleProps(style), figmaId: style.id };
    }
  }

  // Effect Styles : idem
  const effectStyles = await figma.getLocalEffectStylesAsync();
  const effectStylesByName = new Map(effectStyles.map(s => [normalizeStyleName(s.name), s]));
  for (const token of tokens) {
    if (token.type !== "shadow" || isEmptyValue(token)) continue;
    const styleName = normalizeStyleName(styleNameFromPath(token.path));
    const style = effectStylesByName.get(styleName);
    if (style) {
      const props = readEffectStyleProps(style);
      if (props) snapshot[token.path] = { type: "shadow", value: props, figmaId: style.id };
    }
  }

  await figma.clientStorage.setAsync(SNAPSHOT_KEY, snapshot);
}

// Helper: charge la map path → figmaId depuis le snapshot pour les apply
async function loadPathToIdMap(): Promise<{ [path: string]: string }> {
  const snap: any = await figma.clientStorage.getAsync(SNAPSHOT_KEY);
  const map: { [path: string]: string } = {};
  if (snap) {
    for (const path of Object.keys(snap)) {
      const id = snap[path] && snap[path].figmaId;
      if (id) map[path] = id;
    }
  }
  return map;
}

// Lecture des propriétés clés d'un TextStyle dans un format normalisé
function readTextStyleProps(style: TextStyle) {
  const lh = style.lineHeight;
  let lineHeightRatio = 0;
  if (lh && (lh as any).unit === "PERCENT") {
    lineHeightRatio = (lh as any).value / 100;
  } else if (lh && (lh as any).unit === "PIXELS" && style.fontSize > 0) {
    lineHeightRatio = (lh as any).value / style.fontSize;
  }
  return {
    fontFamily: style.fontName.family,
    fontStyle: style.fontName.style,
    fontSize: Math.round(style.fontSize * 10000) / 10000,
    lineHeight: Math.round(lineHeightRatio * 10000) / 10000
  };
}

// Lecture des propriétés clés d'un EffectStyle (premier DROP_SHADOW)
function readEffectStyleProps(style: EffectStyle) {
  const effect = style.effects[0] as DropShadowEffect | undefined;
  if (!effect || effect.type !== "DROP_SHADOW") return null;
  return {
    color: rgbToHex({ r: effect.color.r, g: effect.color.g, b: effect.color.b }),
    opacity: Math.round(effect.color.a * 10000) / 10000,
    offsetX: effect.offset.x,
    offsetY: effect.offset.y,
    blur: effect.radius,
    spread: effect.spread || 0
  };
}

function expectedTypographyProps(expected: any) {
  const family = Array.isArray(expected.fontFamily) ? expected.fontFamily[0] : String(expected.fontFamily);
  const weight = Number(expected.fontWeight);
  const styleName = WEIGHT_TO_STYLE[weight] || "Regular";
  const lh = typeof expected.lineHeight === "number"
    ? expected.lineHeight
    : parseFloat(String(expected.lineHeight));
  return {
    fontFamily: family,
    fontStyle: styleName,
    fontSize: Math.round(parseDimension(expected.fontSize) * 10000) / 10000,
    lineHeight: Math.round((isNaN(lh) ? 0 : lh) * 10000) / 10000
  };
}

function expectedShadowProps(expected: any) {
  const colorObj = expected.color || {};
  const colorHex = (typeof colorObj === "object" && "light" in colorObj
    ? colorObj.light
    : (typeof colorObj === "string" ? colorObj : "#000000"));
  return {
    color: String(colorHex).toUpperCase(),
    opacity: Math.round((typeof expected.opacity === "number" ? expected.opacity : 1) * 10000) / 10000,
    offsetX: parseDimension(expected.offsetX),
    offsetY: parseDimension(expected.offsetY),
    blur: parseDimension(expected.blur),
    spread: parseDimension(expected.spread)
  };
}

async function checkLocalDesync(): Promise<DriftItem[]> {
  await pagesReady;
  const snapshot: { [path: string]: { type: string; value: any; figmaId?: string } } | null =
    await figma.clientStorage.getAsync(SNAPSHOT_KEY);
  if (!snapshot || Object.keys(snapshot).length === 0) return [];

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collection = collections.find(c => c.name === "Somfy Tokens");

  let lightId = "", darkId = "";
  let localMap: Map<string, any> = new Map();
  const localVarsById = new Map<string, any>();
  if (collection) {
    const lightMode = collection.modes.find(m => m.name === "Light") || collection.modes[0];
    const darkMode = collection.modes.find(m => m.name === "Dark");
    lightId = lightMode?.modeId || "";
    darkId = darkMode?.modeId || "";
    localMap = await readFigmaVariables();
    for (const e of localMap.values()) localVarsById.set(e.id, e);
  }

  const textStyles = await figma.getLocalTextStylesAsync();
  const textStylesByName = new Map(textStyles.map(s => [normalizeStyleName(s.name), s]));
  const textStylesById = new Map(textStyles.map(s => [s.id, s]));
  const effectStyles = await figma.getLocalEffectStylesAsync();
  const effectStylesByName = new Map(effectStyles.map(s => [normalizeStyleName(s.name), s]));
  const effectStylesById = new Map(effectStyles.map(s => [s.id, s]));

  const drifts: DriftItem[] = [];

  for (const [path, entry] of Object.entries(snapshot)) {
    if (SUPPORTED_VAR_TYPES.has(entry.type)) {
      // Lookup par ID en priorité, fallback par path (nom)
      let local = entry.figmaId ? localVarsById.get(entry.figmaId) : null;
      let lookedUpById = !!local;
      if (!local) local = localMap.get(path);

      if (!local) {
        // Variable supprimée de Figma
        drifts.push({
          path,
          type: entry.type,
          reason: "deleted",
          expectedValue: entry.value,
          expectedName: tokenPathToFigmaName(path)
        });
        continue;
      }

      // Détection de rename : lookup par ID a réussi mais le nom courant ne match pas l'attendu
      const expectedFigmaName = tokenPathToFigmaName(path);
      // local vient de readFigmaVariables qui ne stocke pas le name brut, mais le path est dérivé du name
      // on compare donc la dotPath actuelle avec la path attendue
      const currentDotPath = [...localMap.entries()].find(([_, v]) => v.id === local.id)?.[0];
      const isRenamed = lookedUpById && currentDotPath && currentDotPath !== path;

      const localSnap = buildLocalSnapshot(local, entry.type, lightId, darkId);
      const expectedSnap = buildRemoteSnapshot({ path, type: entry.type, value: entry.value, isPlaceholder: false });
      const valueDiffers = localSnap !== expectedSnap;

      if (isRenamed) {
        drifts.push({
          path,
          type: entry.type,
          reason: "renamed",
          figmaName: currentDotPath ? tokenPathToFigmaName(currentDotPath) : null,
          expectedName: expectedFigmaName,
          figmaValue: normalizeOldValue(local, entry.type, lightId, darkId),
          expectedValue: entry.value
        });
      } else if (valueDiffers) {
        drifts.push({
          path,
          type: entry.type,
          reason: "modified",
          figmaValue: normalizeOldValue(local, entry.type, lightId, darkId),
          expectedValue: entry.value
        });
      }
    } else if (entry.type === "typography" || entry.type === "shadow") {
      const isTypography = entry.type === "typography";
      const expectedStyleName = styleNameFromPath(path);
      const expectedNorm = normalizeStyleName(expectedStyleName);

      // Lookup par ID en priorité
      let style: BaseStyle | undefined;
      let lookedUpById = false;
      if (entry.figmaId) {
        style = (isTypography ? textStylesById.get(entry.figmaId) : effectStylesById.get(entry.figmaId)) as any;
        if (style) lookedUpById = true;
      }
      if (!style) {
        style = (isTypography ? textStylesByName.get(expectedNorm) : effectStylesByName.get(expectedNorm)) as any;
      }

      if (!style) {
        drifts.push({
          path,
          type: entry.type,
          reason: "deleted",
          expectedValue: entry.value,
          expectedName: expectedStyleName
        });
        continue;
      }

      const isRenamed = lookedUpById && normalizeStyleName(style.name) !== expectedNorm;

      let figmaProps: any;
      let valueDiffers = false;
      const expected = entry.value;

      if (isTypography) {
        figmaProps = readTextStyleProps(style as TextStyle);
        valueDiffers = figmaProps.fontFamily !== expected.fontFamily
          || figmaProps.fontStyle !== expected.fontStyle
          || figmaProps.fontSize !== expected.fontSize
          || figmaProps.lineHeight !== expected.lineHeight;
      } else {
        const props = readEffectStyleProps(style as EffectStyle);
        if (!props) continue;
        figmaProps = props;
        valueDiffers = String(figmaProps.color).toUpperCase() !== String(expected.color).toUpperCase()
          || figmaProps.opacity !== expected.opacity
          || figmaProps.offsetX !== expected.offsetX
          || figmaProps.offsetY !== expected.offsetY
          || figmaProps.blur !== expected.blur
          || figmaProps.spread !== expected.spread;
      }

      if (isRenamed) {
        drifts.push({
          path,
          type: entry.type,
          reason: "renamed",
          figmaName: style.name,
          expectedName: expectedStyleName,
          figmaValue: figmaProps,
          expectedValue: expected
        });
      } else if (valueDiffers) {
        drifts.push({
          path,
          type: entry.type,
          reason: "modified",
          figmaValue: figmaProps,
          expectedValue: expected
        });
      }
    }
  }

  return drifts;
}

// Re-applique un text style depuis le snapshot (le snapshot est déjà au format props)
async function revertTextStyleFromSnapshot(path: string, expected: any, figmaId?: string): Promise<boolean> {
  await pagesReady;
  const targetName = styleNameFromPath(path);
  const targetNorm = normalizeStyleName(targetName);
  const styles = await figma.getLocalTextStylesAsync();
  // Lookup par ID en priorité, fallback par nom normalisé
  let style: TextStyle | undefined;
  if (figmaId) style = styles.find(s => s.id === figmaId);
  if (!style) style = styles.find(s => normalizeStyleName(s.name) === targetNorm);
  if (!style) return false;
  // Restore le nom au cas où il aurait été renommé/normalisé par Figma
  if (style.name !== targetName) style.name = targetName;

  const family = expected.fontFamily;
  const styleStr = expected.fontStyle || "Regular";
  try {
    await figma.loadFontAsync({ family, style: styleStr });
    style.fontName = { family, style: styleStr };
  } catch (e) {
    try {
      await figma.loadFontAsync({ family, style: "Regular" });
      style.fontName = { family, style: "Regular" };
    } catch (e2) {
      return false;
    }
  }
  if (expected.fontSize > 0) style.fontSize = expected.fontSize;
  if (expected.lineHeight > 0) style.lineHeight = { unit: "PERCENT", value: expected.lineHeight * 100 };
  return true;
}

async function revertEffectStyleFromSnapshot(path: string, expected: any, figmaId?: string): Promise<boolean> {
  await pagesReady;
  const targetName = styleNameFromPath(path);
  const targetNorm = normalizeStyleName(targetName);
  const styles = await figma.getLocalEffectStylesAsync();
  let style: EffectStyle | undefined;
  if (figmaId) style = styles.find(s => s.id === figmaId);
  if (!style) style = styles.find(s => normalizeStyleName(s.name) === targetNorm);
  if (!style) return false;
  if (style.name !== targetName) style.name = targetName;

  const colorStr = String(expected.color || "#000000");
  const rgba = colorStr.startsWith("#") ? hexToRgb(colorStr) : { r: 0, g: 0, b: 0, a: 1 };
  const effect: DropShadowEffect = {
    type: "DROP_SHADOW",
    color: { r: rgba.r, g: rgba.g, b: rgba.b, a: expected.opacity },
    offset: { x: expected.offsetX, y: expected.offsetY },
    radius: expected.blur,
    spread: expected.spread,
    visible: true,
    blendMode: "NORMAL"
  };
  style.effects = [effect];
  return true;
}

// ---------- Path / name conversion ----------
function tokenPathToFigmaName(path: string): string {
  return path
    .split(".")
    .map(seg => seg === "_base" ? "base" : seg)
    .join("/");
}

// Figma normalise les noms de styles en supprimant les espaces autour des slashes
// dès qu'on édite/déplace un style (ex: "Loop / X / Y" → "Loop/X/Y").
// Cette fonction permet de comparer les noms indépendamment de cette normalisation.
function normalizeStyleName(name: string): string {
  return (name || "").replace(/\s*\/\s*/g, "/");
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
  for (const s of styles) map.set(normalizeStyleName(s.name), s);
  return map;
}

async function readFigmaEffectStyles(): Promise<Map<string, EffectStyle>> {
  const map = new Map<string, EffectStyle>();
  const styles = await figma.getLocalEffectStylesAsync();
  for (const s of styles) map.set(normalizeStyleName(s.name), s);
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
          diffs.push({
            kind: "modified",
            path: token.path,
            type: token.type,
            oldValue: normalizeOldValue(local, token.type, lightModeId, darkModeId),
            newValue: token.value
          });
        }
      }
    } else if (token.type === "typography") {
      const styleName = normalizeStyleName(styleNameFromPath(token.path));
      if (!textStyles.has(styleName)) {
        diffs.push({ kind: "added", path: token.path, type: token.type, newValue: token.value });
      }
      // Note: deep diff for typography not implemented yet (would require resolving all aliases)
    } else if (token.type === "shadow") {
      const styleName = normalizeStyleName(styleNameFromPath(token.path));
      if (!effectStyles.has(styleName)) {
        diffs.push({ kind: "added", path: token.path, type: token.type, newValue: token.value });
      }
    }
  }

  for (const path of localMap.keys()) {
    if (!seen.has(path)) {
      const local = localMap.get(path)!;
      diffs.push({
        kind: "removed",
        path,
        type: local.type,
        oldValue: normalizeOldValue(local, local.type, lightModeId, darkModeId)
      });
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
  await pagesReady;
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
  const byId = new Map<string, Variable>();
  const byPath = new Map<string, Variable>();
  for (const v of existing) {
    if (v.variableCollectionId === collection.id) {
      byName.set(v.name, v);
      byId.set(v.id, v);
      const dotPath = v.name.replace(/\//g, ".").replace(/\bbase\b/g, "_base");
      byPath.set(dotPath, v);
    }
  }
  // Charge la map des IDs persistés (snapshot précédent) pour résister aux renames
  const pathToId = await loadPathToIdMap();

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
      // Lookup par ID en priorité (résiste aux renames), puis par nom, sinon créer
      const expectedId = pathToId[token.path];
      let variable: Variable | undefined;
      if (expectedId) variable = byId.get(expectedId);
      if (!variable) variable = byName.get(figmaName);
      if (!variable) {
        variable = figma.variables.createVariable(figmaName, collection, figmaType);
        byName.set(figmaName, variable);
        byId.set(variable.id, variable);
        byPath.set(token.path, variable);
      } else {
        // Restore le nom si l'utilisateur l'avait renommé
        if (variable.name !== figmaName) variable.name = figmaName;
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
  await pagesReady;
  const errors: string[] = [];
  let count = 0;

  const existing = await figma.getLocalTextStylesAsync();
  const byName = new Map(existing.map(s => [normalizeStyleName(s.name), s]));
  const byId = new Map(existing.map(s => [s.id, s]));
  const pathToId = await loadPathToIdMap();

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
      const lookupKey = normalizeStyleName(styleName);
      // Lookup par ID puis par nom normalisé, sinon créer
      const expectedId = pathToId[token.path];
      let textStyle: TextStyle | undefined;
      if (expectedId) textStyle = byId.get(expectedId);
      if (!textStyle) textStyle = byName.get(lookupKey);
      if (!textStyle) {
        textStyle = figma.createTextStyle();
        textStyle.name = styleName;
      } else if (textStyle.name !== styleName) {
        textStyle.name = styleName; // restore après rename
      }
      byName.set(lookupKey, textStyle);
      byId.set(textStyle.id, textStyle);

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
  await pagesReady;
  const errors: string[] = [];
  let count = 0;

  const existing = await figma.getLocalEffectStylesAsync();
  const byName = new Map(existing.map(s => [normalizeStyleName(s.name), s]));
  const byId = new Map(existing.map(s => [s.id, s]));
  const pathToId = await loadPathToIdMap();

  for (const token of shadowTokens) {
    try {
      const v = token.value;
      if (!v || typeof v !== "object") continue;

      const styleName = styleNameFromPath(token.path);
      const lookupKey = normalizeStyleName(styleName);
      const expectedId = pathToId[token.path];
      let effectStyle: EffectStyle | undefined;
      if (expectedId) effectStyle = byId.get(expectedId);
      if (!effectStyle) effectStyle = byName.get(lookupKey);
      if (!effectStyle) {
        effectStyle = figma.createEffectStyle();
        effectStyle.name = styleName;
      } else if (effectStyle.name !== styleName) {
        effectStyle.name = styleName;
      }
      byName.set(lookupKey, effectStyle);
      byId.set(effectStyle.id, effectStyle);

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

// ---------- loadAllPagesAsync gate ----------
// En mode "dynamic-page", certaines APIs (getLocalTextStylesAsync, etc.) peuvent
// renvoyer des listes incomplètes tant que loadAllPagesAsync n'est pas résolu.
// On gate toutes les opérations qui touchent aux styles/variables.
const pagesReady: Promise<void> = (async () => {
  try {
    if (typeof (figma as any).loadAllPagesAsync === "function") {
      await (figma as any).loadAllPagesAsync();
    }
  } catch (e) {
    console.error("loadAllPagesAsync failed:", e);
  }
})();

// ---------- Live desync detection ----------
// Re-check drift quand l'utilisateur modifie le document (variables, styles, etc.)
let desyncCheckTimer: any = null;
function scheduleDesyncCheck() {
  if (desyncCheckTimer) clearTimeout(desyncCheckTimer);
  desyncCheckTimer = setTimeout(async () => {
    desyncCheckTimer = null;
    try {
      const drifts = await checkLocalDesync();
      figma.ui.postMessage({ type: "local-desync-computed", drifts });
    } catch (e) {
      console.error("Live desync check failed:", e);
    }
  }, 600);
}

pagesReady.then(() => {
  try {
    figma.on("documentchange", () => {
      scheduleDesyncCheck();
    });
  } catch (e) {
    console.error("Could not register documentchange listener:", e);
  }
});

// ---------- Main message handler ----------
figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === "load-config") {
      const config = await loadConfig();
      const lastSyncedSha = await figma.clientStorage.getAsync("lastSyncedSha");
      const pollInterval = await figma.clientStorage.getAsync("pollInterval");
      const lastAppliedSnapshot = await figma.clientStorage.getAsync(SNAPSHOT_KEY);
      const hasAppliedSnapshot = !!lastAppliedSnapshot && Object.keys(lastAppliedSnapshot).length > 0;
      // Cleanup d'un éventuel ancien snapshot V1 (orphelin sous l'ancienne clé)
      try { await figma.clientStorage.deleteAsync("lastAppliedSnapshot"); } catch (e) {}
      // Détecte si une collection Somfy existe déjà (= sync précédent)
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const hasExistingCollection = collections.some(c => c.name === "Somfy Tokens");
      figma.ui.postMessage({
        type: "config-loaded",
        config,
        lastSyncedSha,
        hasExistingCollection,
        hasAppliedSnapshot,
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

      await saveAppliedSnapshot(cachedTokens, cachedTokenTree);

      figma.ui.postMessage({
        type: "apply-done",
        count: totalCount,
        skipped: totalSkipped,
        errors: allErrors.slice(0, 5)
      });
      figma.notify(`✓ Synced ${totalCount} tokens (${totalSkipped} skipped)`);
    }

    else if (msg.type === "check-local-desync") {
      const drifts = await checkLocalDesync();
      figma.ui.postMessage({ type: "local-desync-computed", drifts });
    }

    else if (msg.type === "revert-local-changes") {
      const snapshot: { [path: string]: { type: string; value: any } } | null =
        await figma.clientStorage.getAsync(SNAPSHOT_KEY);
      if (!snapshot || Object.keys(snapshot).length === 0) {
        figma.ui.postMessage({ type: "error", message: "No sync snapshot found. Apply tokens from GitHub first." });
        return;
      }
      const paths: string[] = msg.paths || [];
      const includes = (path: string) => paths.length === 0 || paths.includes(path);

      const varTokens: FlatToken[] = [];
      const textStyleEntries: [string, any, string | undefined][] = [];
      const effectStyleEntries: [string, any, string | undefined][] = [];

      for (const [path, entry] of Object.entries(snapshot)) {
        if (!includes(path)) continue;
        if (SUPPORTED_VAR_TYPES.has(entry.type)) {
          varTokens.push({ path, type: entry.type, value: entry.value, isPlaceholder: false });
        } else if (entry.type === "typography") {
          textStyleEntries.push([path, entry.value, (entry as any).figmaId]);
        } else if (entry.type === "shadow") {
          effectStyleEntries.push([path, entry.value, (entry as any).figmaId]);
        }
      }

      let count = 0;
      const errors: string[] = [];

      if (varTokens.length > 0) {
        figma.ui.postMessage({ type: "progress", message: "Reverting variables…" });
        const result = await applyVariables(varTokens, (m) =>
          figma.ui.postMessage({ type: "progress", message: m })
        );
        count += result.count;
        errors.push(...result.errors);
      }

      if (textStyleEntries.length > 0) {
        figma.ui.postMessage({ type: "progress", message: "Reverting text styles…" });
        for (const [path, expected, figmaId] of textStyleEntries) {
          try {
            const ok = await revertTextStyleFromSnapshot(path, expected, figmaId);
            if (ok) count++;
          } catch (e: any) {
            const msg = e && e.message ? e.message : String(e);
            if (errors.length < 5) errors.push(`${path}: ${msg}`);
          }
        }
      }

      if (effectStyleEntries.length > 0) {
        figma.ui.postMessage({ type: "progress", message: "Reverting effect styles…" });
        for (const [path, expected, figmaId] of effectStyleEntries) {
          try {
            const ok = await revertEffectStyleFromSnapshot(path, expected, figmaId);
            if (ok) count++;
          } catch (e: any) {
            const msg = e && e.message ? e.message : String(e);
            if (errors.length < 5) errors.push(`${path}: ${msg}`);
          }
        }
      }

      figma.ui.postMessage({ type: "revert-done", count, errors: errors.slice(0, 5) });
      figma.notify(`↩ Reverted ${count} item${count !== 1 ? "s" : ""} to last sync`);
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
