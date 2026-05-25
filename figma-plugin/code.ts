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
  reason?: "modified" | "renamed" | "deleted" | "added";
  figmaValue?: any;
  expectedValue?: any;
  figmaName?: string | null;
  expectedName?: string;
  figmaId?: string; // used by ADDED to delete the Figma item on revert
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
  return config || { token: "", owner: "", repo: "", branch: "develop", filePath: "" };
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
  if (typeof v === "string") {
    let s = v.trim();
    if (s.startsWith("#")) s = s.slice(1);
    // Expand short hex forms (#RGB → #RRGGBB, #RGBA → #RRGGBBAA)
    if (s.length === 3 || s.length === 4) {
      s = s.split("").map((c) => c + c).join("");
    }
    // Strip implicit fully-opaque alpha (FF) so it matches rgbToHex output
    if (s.length === 8 && s.slice(6, 8).toUpperCase() === "FF") s = s.slice(0, 6);
    return "#" + s.toUpperCase();
  }
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

/**
 * Supprime les Variables / Text Styles / Effect Styles qui étaient présents dans
 * le snapshot précédent mais qui n'ont plus de token correspondant dans le JSON courant.
 * Ne touche que ce qu'on a créé nous-mêmes (tracé via figmaId dans le snapshot).
 * Retourne le nombre d'éléments supprimés.
 */
async function cleanupOrphans(cachedTokens: FlatToken[]): Promise<{ removed: number; errors: string[] }> {
  await pagesReady;

  const expectedPaths = new Set<string>();
  for (const t of cachedTokens) {
    if (isEmptyValue(t)) continue;
    expectedPaths.add(t.path);
  }

  const errors: string[] = [];
  let removed = 0;

  // 1. Variables : scan direct de la collection "Somfy Tokens" (ne dépend pas du snapshot)
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collection = collections.find(c => c.name === "Somfy Tokens");
  if (collection) {
    for (const varId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (!variable) continue;
      const dotPath = variable.name.replace(/\//g, ".").replace(/\bbase\b/g, "_base");
      if (expectedPaths.has(dotPath)) continue;
      console.log("[cleanupOrphans] orphan variable:", variable.name, "→ path:", dotPath);
      try {
        variable.remove();
        removed++;
      } catch (e: any) {
        console.error("[cleanupOrphans] failed to remove variable", variable.name, e);
        errors.push(`Failed to remove ${variable.name}: ${e.message || e}`);
      }
    }
  }

  // 2. Text Styles / Effect Styles : on s'appuie sur le snapshot (pas de namespace fiable pour scanner)
  const snap: any = await figma.clientStorage.getAsync(SNAPSHOT_KEY);
  if (snap) {
    for (const path of Object.keys(snap)) {
      if (expectedPaths.has(path)) continue;
      const entry = snap[path];
      const id: string | undefined = entry && entry.figmaId;
      const type: string | undefined = entry && entry.type;
      if (!id) continue;
      if (type !== "typography" && type !== "shadow") continue; // variables already handled above

      try {
        if (type === "typography") {
          const styles = await figma.getLocalTextStylesAsync();
          const style = styles.find(s => s.id === id);
          if (style) {
            console.log("[cleanupOrphans] orphan text style:", path);
            style.remove();
            removed++;
          }
        } else if (type === "shadow") {
          const styles = await figma.getLocalEffectStylesAsync();
          const style = styles.find(s => s.id === id);
          if (style) {
            console.log("[cleanupOrphans] orphan effect style:", path);
            style.remove();
            removed++;
          }
        }
      } catch (e: any) {
        console.error("[cleanupOrphans] failed to remove style", path, e);
        errors.push(`Failed to remove ${path}: ${e.message || e}`);
      }
    }
  }

  console.log("[cleanupOrphans] done. removed=", removed);
  return { removed, errors };
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

  // If a push is pending merge, the snapshot is ahead of the remote JSON.
  // Disable the JSON fallback in that case — otherwise reverting a value to the
  // pre-push state in Figma would silently match the (still old) JSON and hide a drift.
  const pushPending = !!(await figma.clientStorage.getAsync("pushPending"));

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

  // The current JSON tokens (last fetched). Used as a fallback: if Figma matches
  // the current JSON value, we don't surface drift even if the snapshot is stale.
  const cachedByPath = new Map<string, FlatToken>();
  for (const t of cachedTokens) cachedByPath.set(t.path, t);

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

      const localSnap = buildLocalSnapshot(local, entry.type, lightId, darkId, entry.value);
      const expectedSnap = buildRemoteSnapshot({ path, type: entry.type, value: entry.value, isPlaceholder: false });
      let valueDiffers = localSnap !== expectedSnap;

      // Fallback: if the snapshot is stale, check whether Figma matches the current JSON.
      // Use the JSON's mode definition (not the snapshot's) so that newly-emptied modes don't drift.
      // Skipped when a push is pending: the snapshot is ahead of the JSON and the fallback
      // would mask legitimate drifts created by reverting Figma to the pre-push state.
      if (valueDiffers && !pushPending) {
        const cached = cachedByPath.get(path);
        if (cached) {
          const remoteSnap = buildRemoteSnapshot(cached);
          const localSnapVsCached = buildLocalSnapshot(local, entry.type, lightId, darkId, cached.value);
          if (localSnapVsCached === remoteSnap) valueDiffers = false;
        }
      }

      // For the display arrow, show the CURRENT JSON value as the target — that's
      // what the user expects to align against on GitHub. Fall back to the snapshot
      // value when no JSON has been fetched yet, or when a push is pending
      // (in that case the snapshot is the desired state, ahead of the JSON).
      const cachedForDisplay = cachedByPath.get(path);
      const displayExpected = (cachedForDisplay && !pushPending) ? cachedForDisplay.value : entry.value;

      if (isRenamed) {
        drifts.push({
          path,
          type: entry.type,
          reason: "renamed",
          figmaName: currentDotPath ? tokenPathToFigmaName(currentDotPath) : null,
          expectedName: expectedFigmaName,
          figmaValue: normalizeOldValue(local, entry.type, lightId, darkId),
          expectedValue: displayExpected
        });
      } else if (valueDiffers) {
        drifts.push({
          path,
          type: entry.type,
          reason: "modified",
          figmaValue: normalizeOldValue(local, entry.type, lightId, darkId),
          expectedValue: displayExpected
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

  // ADDED: Figma items with no corresponding JSON token. detectAddedItems()
  // reads cachedTokens directly, so it must run after cachedTokens has been
  // populated (i.e. after at least one "Check" / tokens-fetched).
  if (cachedTokens.length > 0) {
    const addedItems = await detectAddedItems();
    drifts.push(...addedItems);
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

// ---------- Push to GitHub: build modified JSON from drifts ----------

// Reverse map fontStyle name -> fontWeight number (case-insensitive lookup).
const STYLE_TO_WEIGHT: { [key: string]: number } = (() => {
  const m: { [key: string]: number } = {};
  for (const w in WEIGHT_TO_STYLE) m[WEIGHT_TO_STYLE[Number(w)].toLowerCase()] = Number(w);
  return m;
})();

// Reverse of tokenPathToFigmaName for Variables (slash -> dot).
// "_base" is collapsed to "base" by tokenPathToFigmaName; if the original path
// had "_base" at the same index, restore it.
function figmaVarNameToJsonPath(figmaName: string, expectedPath?: string): string {
  const segs = figmaName.split("/");
  const expectedSegs = expectedPath ? expectedPath.split(".") : [];
  return segs
    .map((seg, i) => (seg === "base" && expectedSegs[i] === "_base" ? "_base" : seg))
    .join(".");
}

function cloneTree(tree: any): any {
  return JSON.parse(JSON.stringify(tree));
}

function getNodeByPath(tree: any, path: string): any {
  const segs = path.split(".");
  let node = tree;
  for (const s of segs) {
    if (!node || typeof node !== "object" || !(s in node)) return null;
    node = node[s];
  }
  return node;
}

function setNodeByPath(tree: any, path: string, value: any): void {
  const segs = path.split(".");
  let node = tree;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (!node[s] || typeof node[s] !== "object") node[s] = {};
    node = node[s];
  }
  node[segs[segs.length - 1]] = value;
}

// Removes the node at path, then prunes any parent groups left with only $-fields or nothing.
function deleteNodeByPath(tree: any, path: string): void {
  const segs = path.split(".");
  const parents: any[] = [];
  let node = tree;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (!node || typeof node !== "object" || !(s in node)) return;
    parents.push(node);
    node = node[s];
  }
  if (!node || typeof node !== "object") return;
  delete node[segs[segs.length - 1]];

  for (let i = parents.length - 1; i >= 0; i--) {
    const parent = parents[i];
    const childKey = segs[i];
    const childNode = parent[childKey];
    if (childNode && typeof childNode === "object") {
      const keys = Object.keys(childNode).filter(k => !k.startsWith("$"));
      if (keys.length === 0 && !("$value" in childNode)) delete parent[childKey];
      else break;
    }
  }
}

function fontStyleToWeight(style: string): number | null {
  const w = STYLE_TO_WEIGHT[String(style).toLowerCase()];
  return typeof w === "number" ? w : null;
}

// color: figmaValue is either a hex string (single mode) or {light, dark}.
// Preserve the original $value shape (alias keys, modes) and only override values.
function buildModifiedValueForColor(originalValue: any, figmaValue: any): any {
  if (typeof figmaValue === "string") {
    if (originalValue && typeof originalValue === "object" && "light" in originalValue) {
      return Object.assign({}, originalValue, { light: figmaValue });
    }
    return figmaValue;
  }
  if (figmaValue && typeof figmaValue === "object") {
    if (originalValue && typeof originalValue === "object") {
      return Object.assign({}, originalValue, figmaValue);
    }
    return Object.assign({}, figmaValue);
  }
  return figmaValue;
}

// typography: keep aliased fields untouched; only override the props that
// differ between Figma readback and the resolved expected props.
function buildModifiedValueForTypography(originalValue: any, figmaValue: any, expectedValue: any): any {
  const out: any = Object.assign({}, originalValue && typeof originalValue === "object" ? originalValue : {});
  if (!expectedValue) return out;

  if (figmaValue.fontFamily !== expectedValue.fontFamily) {
    out.fontFamily = figmaValue.fontFamily;
  }
  if (figmaValue.fontStyle !== expectedValue.fontStyle) {
    const w = fontStyleToWeight(figmaValue.fontStyle);
    if (w !== null) out.fontWeight = w;
  }
  if (figmaValue.fontSize !== expectedValue.fontSize) {
    out.fontSize = `${figmaValue.fontSize}px`;
  }
  if (figmaValue.lineHeight !== expectedValue.lineHeight) {
    out.lineHeight = figmaValue.lineHeight;
  }
  return out;
}

function buildModifiedValueForShadow(originalValue: any, figmaValue: any, expectedValue: any): any {
  const out: any = Object.assign({}, originalValue && typeof originalValue === "object" ? originalValue : {});
  if (!expectedValue) return out;

  const figmaColor = String(figmaValue.color).toUpperCase();
  const expectedColor = String(expectedValue.color || (expectedValue.color && expectedValue.color.light) || "").toUpperCase();
  if (figmaColor !== expectedColor) {
    if (out.color && typeof out.color === "object" && ("light" in out.color || "dark" in out.color)) {
      out.color = Object.assign({}, out.color, { light: figmaColor });
    } else {
      out.color = figmaColor;
    }
  }
  if (figmaValue.opacity !== expectedValue.opacity) out.opacity = figmaValue.opacity;
  if (figmaValue.offsetX !== expectedValue.offsetX) out.offsetX = `${figmaValue.offsetX}px`;
  if (figmaValue.offsetY !== expectedValue.offsetY) out.offsetY = `${figmaValue.offsetY}px`;
  if (figmaValue.blur !== expectedValue.blur) out.blur = `${figmaValue.blur}px`;
  if (figmaValue.spread !== expectedValue.spread) out.spread = `${figmaValue.spread}px`;
  return out;
}

function applyDriftToTree(tree: any, drift: DriftItem): { ok: boolean; reason?: string } {
  const targetPath = drift.path;
  const targetNode = getNodeByPath(tree, targetPath);

  if (drift.reason === "added") {
    if (drift.figmaValue === undefined || drift.figmaValue === null) {
      return { ok: false, reason: "missing figmaValue" };
    }
    if (getNodeByPath(tree, targetPath) && getNodeByPath(tree, targetPath).$value !== undefined) {
      return { ok: false, reason: `path already exists in JSON: ${targetPath}` };
    }
    const newNode: any = { $type: drift.type, $value: buildAddedJsonValue(drift) };
    setNodeByPath(tree, targetPath, newNode);
    return { ok: true };
  }

  if (drift.reason === "deleted") {
    deleteNodeByPath(tree, targetPath);
    return { ok: true };
  }

  if (drift.reason === "renamed") {
    if (!SUPPORTED_VAR_TYPES.has(drift.type)) {
      return { ok: false, reason: "rename of composite style (typography/shadow) not supported yet" };
    }
    if (!drift.figmaName) return { ok: false, reason: "missing figmaName" };
    const newPath = figmaVarNameToJsonPath(drift.figmaName, targetPath);
    if (newPath === targetPath) return { ok: true };
    if (!targetNode) return { ok: false, reason: `original path not found: ${targetPath}` };

    const modifiedNode = Object.assign({}, targetNode);
    if (drift.figmaValue !== undefined) {
      if (drift.type === "color") {
        modifiedNode.$value = buildModifiedValueForColor(targetNode.$value, drift.figmaValue);
      } else if (drift.type === "dimension" || drift.type === "number" || drift.type === "fontWeight" || drift.type === "fontFamily") {
        modifiedNode.$value = drift.figmaValue;
      }
    }
    deleteNodeByPath(tree, targetPath);
    setNodeByPath(tree, newPath, modifiedNode);
    return { ok: true };
  }

  // modified
  if (!targetNode) return { ok: false, reason: `path not found: ${targetPath}` };

  if (drift.type === "color") {
    targetNode.$value = buildModifiedValueForColor(targetNode.$value, drift.figmaValue);
  } else if (drift.type === "dimension" || drift.type === "number" || drift.type === "fontWeight" || drift.type === "fontFamily") {
    targetNode.$value = drift.figmaValue;
  } else if (drift.type === "typography") {
    targetNode.$value = buildModifiedValueForTypography(targetNode.$value, drift.figmaValue, drift.expectedValue);
  } else if (drift.type === "shadow") {
    targetNode.$value = buildModifiedValueForShadow(targetNode.$value, drift.figmaValue, drift.expectedValue);
  } else {
    return { ok: false, reason: `unsupported type: ${drift.type}` };
  }
  return { ok: true };
}

interface PushPayload {
  tree: any;
  applied: DriftItem[];
  skipped: { path: string; type: string; reason: string }[];
}

// ---------- ADDED detection (Figma items with no corresponding JSON token) ----------

// Heuristic: figure out a W3C $type from a Figma Variable. Path hints disambiguate
// FLOAT (dimension vs number vs fontWeight). Returns null for unsupported types
// (e.g. BOOLEAN, or STRING with no obvious meaning).
function inferTokenTypeFromVariable(variable: Variable, dotPath: string): string | null {
  const resolved = String(variable.resolvedType || "").toLowerCase();
  if (resolved === "color") return "color";
  if (resolved === "boolean") return null;
  if (resolved === "string") return "fontFamily";
  if (resolved === "float") {
    const p = dotPath.toLowerCase();
    if (/(^|\.)weight($|\.)|fontweight/.test(p)) return "fontWeight";
    if (/(^|\.)number($|\.)|opacity|duration|ratio|count/.test(p)) return "number";
    return "dimension";
  }
  return null;
}

// Reads the variable's value at the light/dark modes, normalizing to JSON shape
// (hex / { light, dark } for color; number for dimension/number/fontWeight; string for family).
function readVariableValueForJson(variable: Variable, type: string, lightId: string, darkId: string): any {
  const lightVal = variable.valuesByMode[lightId];
  const darkVal = darkId ? variable.valuesByMode[darkId] : undefined;

  if (type === "color") {
    const lightHex = normalizeColor(lightVal);
    if (darkVal !== undefined && darkVal !== null) {
      return { light: lightHex, dark: normalizeColor(darkVal) };
    }
    return lightHex;
  }
  if (type === "dimension" || type === "number" || type === "fontWeight") {
    return typeof lightVal === "number" ? Math.round(lightVal * 10000) / 10000 : lightVal;
  }
  if (type === "fontFamily") {
    return String(lightVal || "");
  }
  return lightVal;
}

// Reverse of styleNameFromPath, for a style name like "Loop / Typography / Title Soft".
// Returns the dot-suffix WITHOUT the top-level "composite." / "primitives." prefix.
function styleNameToPathSuffix(figmaName: string): string {
  const norm = normalizeStyleName(figmaName); // "Loop/Typography/Title Soft"
  return norm
    .split("/")
    .map(s => s.trim().toLowerCase().replace(/\s+/g, "-"))
    .join(".");
}

// Pick the top-level prefix ("composite" or "primitives") for an ADDED style by
// sampling existing tokens of the same type. Falls back to W3C-typical defaults.
function inferStylePrefix(type: "typography" | "shadow"): string {
  for (const t of cachedTokens) {
    if (t.type !== type) continue;
    const first = t.path.split(".")[0];
    if (first) return first + ".";
  }
  return type === "typography" ? "composite." : "primitives.";
}

// Builds the full W3C $value object for an ADDED drift from its raw Figma readback.
function buildAddedJsonValue(drift: DriftItem): any {
  const v = drift.figmaValue;
  if (drift.type === "color") return v;
  if (drift.type === "dimension") return typeof v === "number" ? `${v}px` : v;
  if (drift.type === "number" || drift.type === "fontWeight") return v;
  if (drift.type === "fontFamily") return [String(v)];
  if (drift.type === "typography") {
    const weight = fontStyleToWeight(v.fontStyle) || 400;
    return {
      fontFamily: v.fontFamily,
      fontWeight: weight,
      fontSize: `${v.fontSize}px`,
      lineHeight: v.lineHeight
    };
  }
  if (drift.type === "shadow") {
    return {
      color: v.color,
      offsetX: `${v.offsetX}px`,
      offsetY: `${v.offsetY}px`,
      blur: `${v.blur}px`,
      spread: `${v.spread}px`,
      opacity: v.opacity
    };
  }
  return v;
}

// Scans Figma for variables/styles that have no corresponding token in cachedTokens.
async function detectAddedItems(): Promise<DriftItem[]> {
  await pagesReady;
  const added: DriftItem[] = [];

  const existingPaths = new Set<string>();
  const existingTypographyNames = new Set<string>();
  const existingShadowNames = new Set<string>();
  for (const t of cachedTokens) {
    existingPaths.add(t.path);
    if (t.type === "typography") existingTypographyNames.add(normalizeStyleName(styleNameFromPath(t.path)));
    if (t.type === "shadow") existingShadowNames.add(normalizeStyleName(styleNameFromPath(t.path)));
  }

  // Also exclude items already present in the snapshot. After a push that adds a
  // token, the snapshot is updated immediately but the JSON only catches up on
  // PR merge — so without this check the freshly-pushed item would surface as
  // an ADDED drift again (alongside the "PR pending merge" banner).
  const snapshot: { [k: string]: any } | null = await figma.clientStorage.getAsync(SNAPSHOT_KEY);
  const snapshotPaths = new Set<string>(snapshot ? Object.keys(snapshot) : []);
  const snapshotTypographyNames = new Set<string>();
  const snapshotShadowNames = new Set<string>();
  if (snapshot) {
    for (const [path, entry] of Object.entries(snapshot)) {
      if (entry.type === "typography") snapshotTypographyNames.add(normalizeStyleName(styleNameFromPath(path)));
      if (entry.type === "shadow") snapshotShadowNames.add(normalizeStyleName(styleNameFromPath(path)));
    }
  }

  // 1. Variables
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collection = collections.find(c => c.name === "Somfy Tokens");
  if (collection) {
    const lightMode = collection.modes.find(m => m.name === "Light") || collection.modes[0];
    const darkMode = collection.modes.find(m => m.name === "Dark");
    const lightId = lightMode?.modeId || "";
    const darkId = darkMode?.modeId || "";

    for (const varId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (!variable) continue;
      const dotPath = variable.name.replace(/\//g, ".").replace(/\bbase\b/g, "_base");
      if (existingPaths.has(dotPath)) continue;
      if (snapshotPaths.has(dotPath)) continue;

      const tokenType = inferTokenTypeFromVariable(variable, dotPath);
      if (!tokenType) continue;
      const figmaValue = readVariableValueForJson(variable, tokenType, lightId, darkId);
      added.push({
        path: dotPath,
        type: tokenType,
        reason: "added",
        figmaValue,
        figmaName: variable.name,
        figmaId: variable.id
      });
    }
  }

  // 2. Text styles -> typography
  const textStyles = await figma.getLocalTextStylesAsync();
  for (const style of textStyles) {
    const norm = normalizeStyleName(style.name);
    if (existingTypographyNames.has(norm)) continue;
    if (snapshotTypographyNames.has(norm)) continue;
    const props = readTextStyleProps(style);
    const pathSuffix = styleNameToPathSuffix(style.name);
    const prefix = inferStylePrefix("typography");
    added.push({
      path: `${prefix}${pathSuffix}`,
      type: "typography",
      reason: "added",
      figmaValue: props,
      figmaName: style.name,
      figmaId: style.id
    });
  }

  // 3. Effect styles -> shadow (only DROP_SHADOW)
  const effectStyles = await figma.getLocalEffectStylesAsync();
  for (const style of effectStyles) {
    const norm = normalizeStyleName(style.name);
    if (existingShadowNames.has(norm)) continue;
    if (snapshotShadowNames.has(norm)) continue;
    const props = readEffectStyleProps(style);
    if (!props) continue;
    const pathSuffix = styleNameToPathSuffix(style.name);
    const prefix = inferStylePrefix("shadow");
    added.push({
      path: `${prefix}${pathSuffix}`,
      type: "shadow",
      reason: "added",
      figmaValue: props,
      figmaName: style.name,
      figmaId: style.id
    });
  }

  return added;
}

function buildPushPayload(drifts: DriftItem[]): PushPayload {
  if (!cachedTokenTree) throw new Error("No JSON cached. Click 'Check' to fetch from GitHub first.");
  const tree = cloneTree(cachedTokenTree);
  const applied: DriftItem[] = [];
  const skipped: { path: string; type: string; reason: string }[] = [];
  for (const drift of drifts) {
    const result = applyDriftToTree(tree, drift);
    if (result.ok) applied.push(drift);
    else skipped.push({ path: drift.path, type: drift.type, reason: result.reason || "unknown" });
  }
  return { tree, applied, skipped };
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

// For a color value (string or {light, dark}), determine which modes carry an actual color.
// Modes with empty/missing values are considered "not defined" and skipped in comparisons.
function definedColorModes(v: any): { light: boolean; dark: boolean } {
  const hasLight = (x: any) => typeof x === "string" && x.trim() !== "";
  if (v && typeof v === "object" && ("light" in v || "dark" in v)) {
    return { light: hasLight(v.light), dark: hasLight(v.dark) };
  }
  return { light: hasLight(v), dark: false };
}

function buildRemoteSnapshot(token: FlatToken): string {
  if (token.type === "color") {
    const v = token.value;
    const modes = definedColorModes(v);
    const parts: string[] = [];
    if (v && typeof v === "object" && ("light" in v || "dark" in v)) {
      if (modes.light) parts.push(`L:${normalizeColor(v.light)}`);
      if (modes.dark) parts.push(`D:${normalizeColor(v.dark)}`);
    } else if (modes.light) {
      parts.push(`L:${normalizeColor(v)}`);
    }
    return parts.join("|");
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

function buildLocalSnapshot(
  local: any,
  type: string,
  lightId: string,
  darkId: string,
  remoteValue?: any
): string {
  // type here is the REMOTE token type (from JSON): color, dimension, number, fontWeight, fontFamily
  if (type === "color") {
    // Only include modes that are defined in the remote — undefined modes shouldn't trigger drift.
    const modes = definedColorModes(remoteValue);
    const parts: string[] = [];
    if (modes.light) parts.push(`L:${normalizeColor(local.values[lightId])}`);
    if (modes.dark) parts.push(`D:${normalizeColor(local.values[darkId])}`);
    return parts.join("|");
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
  darkModeId: string,
  snapshot?: { [path: string]: { type: string; value: any; figmaId?: string } } | null
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
        const localSnapshot = buildLocalSnapshot(local, token.type, lightModeId, darkModeId, token.value);
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

  // Detect removed typography / shadow tokens via the previous apply snapshot.
  // (Variables already covered above via localMap; styles need the snapshot to know which Figma items we created.)
  if (snapshot) {
    const textStylesById = new Map<string, TextStyle>();
    textStyles.forEach(s => textStylesById.set(s.id, s));
    const effectStylesById = new Map<string, EffectStyle>();
    effectStyles.forEach(s => effectStylesById.set(s.id, s));

    for (const snapPath of Object.keys(snapshot)) {
      if (seen.has(snapPath)) continue; // still present in remote
      const entry = snapshot[snapPath];
      if (!entry || !entry.figmaId) continue;
      if (entry.type === "typography" && textStylesById.has(entry.figmaId)) {
        diffs.push({
          kind: "removed",
          path: snapPath,
          type: "typography",
          oldValue: entry.value
        });
      } else if (entry.type === "shadow" && effectStylesById.has(entry.figmaId)) {
        diffs.push({
          kind: "removed",
          path: snapPath,
          type: "shadow",
          oldValue: entry.value
        });
      }
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
      const pendingPushUrl = await figma.clientStorage.getAsync("pendingPushUrl");
      figma.ui.postMessage({
        type: "config-loaded",
        config,
        lastSyncedSha,
        hasExistingCollection,
        hasAppliedSnapshot,
        pollInterval,
        pendingPushUrl: pendingPushUrl || null
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

      let snapshot = await figma.clientStorage.getAsync(SNAPSHOT_KEY) as { [k: string]: any } | null;

      // Ghost snapshot cleanup: prune entries whose path is gone from BOTH the
      // new JSON and Figma. These are "deleted" drifts that would surface
      // forever otherwise (the entity no longer exists anywhere — there's
      // nothing left to push or revert). Typical trigger: state desync after
      // a merge/Apply ordering mishap (e.g. Apply with a stale cachedTokens
      // re-creating already-deleted items, then deletion propagating).
      if (snapshot) {
        const cachedPaths = new Set<string>();
        for (const t of tokens) cachedPaths.add(t.path);
        // Build ID sets from the existing maps so the "still in Figma" check is
        // done against entities currently in the collection / local styles list.
        // We can't trust figma.variables.getVariableByIdAsync() here: it can
        // return non-null for variables that have been removed from the
        // collection (stale Figma reference), which would keep ghost entries
        // alive forever.
        const varIds = new Set<string>();
        for (const v of localMap.values()) if (v && v.id) varIds.add(v.id);
        const textStyleIds = new Set<string>();
        for (const s of textStyles.values()) if (s && s.id) textStyleIds.add(s.id);
        const effectStyleIds = new Set<string>();
        for (const s of effectStyles.values()) if (s && s.id) effectStyleIds.add(s.id);

        const cleaned: { [k: string]: any } = {};
        let pruned = 0;
        for (const [path, entry] of Object.entries(snapshot)) {
          if (cachedPaths.has(path)) { cleaned[path] = entry; continue; }
          let inFigma = false;
          if (SUPPORTED_VAR_TYPES.has(entry.type)) {
            if (entry.figmaId && varIds.has(entry.figmaId)) inFigma = true;
            else if (localMap.get(path)) inFigma = true;
          } else if (entry.type === "typography") {
            if (entry.figmaId && textStyleIds.has(entry.figmaId)) inFigma = true;
            else {
              const name = normalizeStyleName(styleNameFromPath(path));
              if (textStyles.get(name)) inFigma = true;
            }
          } else if (entry.type === "shadow") {
            if (entry.figmaId && effectStyleIds.has(entry.figmaId)) inFigma = true;
            else {
              const name = normalizeStyleName(styleNameFromPath(path));
              if (effectStyles.get(name)) inFigma = true;
            }
          }
          if (inFigma) cleaned[path] = entry;
          else pruned++;
        }
        if (pruned > 0) {
          await figma.clientStorage.setAsync(SNAPSHOT_KEY, cleaned);
          snapshot = cleaned;
          console.log(`[snapshot] pruned ${pruned} ghost entries (gone from JSON + Figma)`);
        }
      }

      // Auto-clear pushPending if the fetched JSON now matches our expected
      // post-merge state (= the PR has been merged upstream). Uses two signals:
      //   (1) the set of paths recorded at push time ("expectedPostMergePaths")
      //   (2) variable value parity between snapshot and fetched JSON
      // Runs after ghost cleanup so leftover ghosts don't block the check.
      const pushPending = await figma.clientStorage.getAsync("pushPending");
      if (pushPending && snapshot) {
        const cachedByPath = new Map<string, FlatToken>();
        for (const t of tokens) cachedByPath.set(t.path, t);
        let allAligned = true;

        // (1) Path set check — only when we have a recorded expectation from a
        // push that happened with this version of the plugin. Without it, a
        // deletion push that isn't merged yet would falsely look aligned (the
        // value-only check doesn't see the missing path).
        const expectedPaths = await figma.clientStorage.getAsync("expectedPostMergePaths") as string[] | null;
        if (expectedPaths) {
          const expected = new Set(expectedPaths);
          const cachedPathSet = new Set(tokens.map(t => t.path));
          if (expected.size !== cachedPathSet.size) {
            allAligned = false;
          } else {
            for (const p of cachedPathSet) {
              if (!expected.has(p)) { allAligned = false; break; }
            }
          }
        }

        // (2) Variable value parity — always run. Catches modify-pushes and
        // confirms addition-pushes have actually landed in JSON.
        if (allAligned) {
          for (const [path, entry] of Object.entries(snapshot)) {
            if (!SUPPORTED_VAR_TYPES.has(entry.type)) continue;
            const cached = cachedByPath.get(path);
            if (!cached) { allAligned = false; break; }
            const snapSig = buildRemoteSnapshot({ path, type: entry.type, value: entry.value, isPlaceholder: false });
            const cachedSig = buildRemoteSnapshot(cached);
            if (snapSig !== cachedSig) { allAligned = false; break; }
          }
        }

        if (allAligned) {
          await figma.clientStorage.setAsync("pushPending", false);
          await figma.clientStorage.setAsync("pendingPushUrl", null);
          await figma.clientStorage.setAsync("expectedPostMergePaths", null);
          console.log("[push] auto-cleared pushPending: fetched JSON aligns with expected post-merge state");
        }
      }

      const diffs = computeDiffs(tokens, localMap, textStyles, effectStyles, lightModeId, darkModeId, snapshot);
      const pendingPushUrlAfter = await figma.clientStorage.getAsync("pendingPushUrl");
      figma.ui.postMessage({
        type: "diffs-computed",
        diffs,
        totalTokens: tokens.length,
        placeholders: tokens.filter(t => t.isPlaceholder).length,
        pendingPushUrl: pendingPushUrlAfter || null
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

      // 4. Cleanup: remove Variables/TextStyles/EffectStyles that no longer have a matching token.
      // Must run before saveAppliedSnapshot so we still have the previous snapshot for ID lookup.
      figma.ui.postMessage({ type: "progress", message: "Cleaning up removed tokens…" });
      const cleanup = await cleanupOrphans(cachedTokens);
      allErrors.push(...cleanup.errors);

      await saveAppliedSnapshot(cachedTokens, cachedTokenTree);
      // Apply syncs Figma to the JSON: snapshot and JSON are aligned again, so a previous
      // post-push state (if any) is no longer relevant.
      await figma.clientStorage.setAsync("pushPending", false);
      await figma.clientStorage.setAsync("pendingPushUrl", null);
      await figma.clientStorage.setAsync("expectedPostMergePaths", null);

      figma.ui.postMessage({
        type: "apply-done",
        count: totalCount,
        skipped: totalSkipped,
        removed: cleanup.removed,
        errors: allErrors.slice(0, 5)
      });
      const removedSuffix = cleanup.removed > 0 ? `, ${cleanup.removed} removed` : "";
      figma.notify(`✓ Synced ${totalCount} tokens${removedSuffix} (${totalSkipped} skipped)`);
    }

    else if (msg.type === "check-local-desync") {
      const drifts = await checkLocalDesync();
      figma.ui.postMessage({ type: "local-desync-computed", drifts });
    }

    else if (msg.type === "revert-local-changes") {
      const snapshot: { [path: string]: { type: string; value: any } } =
        (await figma.clientStorage.getAsync(SNAPSHOT_KEY)) || {};
      const addedItems: { figmaId: string; type: string; path: string }[] = msg.addedItems || [];

      if (Object.keys(snapshot).length === 0 && addedItems.length === 0) {
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

      // Revert ADDED: delete the Figma item by id. The bulk confirmation in the UI
      // warns the user before we get here.
      if (addedItems.length > 0) {
        figma.ui.postMessage({ type: "progress", message: "Removing added items…" });
        for (const item of addedItems) {
          try {
            if (SUPPORTED_VAR_TYPES.has(item.type)) {
              const variable = await figma.variables.getVariableByIdAsync(item.figmaId);
              if (variable) {
                variable.remove();
                count++;
              }
            } else if (item.type === "typography") {
              const styles = await figma.getLocalTextStylesAsync();
              const style = styles.find(s => s.id === item.figmaId);
              if (style) { style.remove(); count++; }
            } else if (item.type === "shadow") {
              const styles = await figma.getLocalEffectStylesAsync();
              const style = styles.find(s => s.id === item.figmaId);
              if (style) { style.remove(); count++; }
            }
          } catch (e: any) {
            const m = e && e.message ? e.message : String(e);
            if (errors.length < 5) errors.push(`${item.path}: ${m}`);
          }
        }
      }

      figma.ui.postMessage({ type: "revert-done", count, errors: errors.slice(0, 5) });
      figma.notify(`↩ Reverted ${count} item${count !== 1 ? "s" : ""} to last sync`);
    }

    else if (msg.type === "build-push-payload") {
      if (!cachedTokenTree) {
        figma.ui.postMessage({ type: "push-payload-ready", error: "No JSON cached. Click 'Check' to fetch from GitHub first." });
        return;
      }
      const drifts = await checkLocalDesync();
      if (drifts.length === 0) {
        figma.ui.postMessage({ type: "push-payload-ready", error: "No local modifications to push." });
        return;
      }
      try {
        const { tree, applied, skipped } = buildPushPayload(drifts);
        figma.ui.postMessage({
          type: "push-payload-ready",
          tree,
          applied,
          skipped
        });
      } catch (e: any) {
        figma.ui.postMessage({ type: "push-payload-ready", error: e && e.message ? e.message : String(e) });
      }
    }

    else if (msg.type === "push-done") {
      // PR créée: on adopte le tree modifié comme nouvelle source of truth locale
      // (sinon le snapshot resterait sur l'ancienne valeur et un revert à la main
      // dans Figma ne lèverait pas de drift). Le user fera Check après le merge
      // réel pour re-synchroniser avec GitHub.
      if (msg.tree) {
        cachedTokenTree = msg.tree;
        cachedTokens = flattenTokens(msg.tree);
        await saveAppliedSnapshot(cachedTokens, cachedTokenTree);
        // Snapshot is now ahead of remote JSON until the PR is merged + re-applied.
        // The drift JSON fallback must be disabled while this flag is set.
        await figma.clientStorage.setAsync("pushPending", true);
        // Persist the PR URL so the "PR pending merge" banner can survive
        // plugin reloads and link to the PR directly.
        if (msg.url) await figma.clientStorage.setAsync("pendingPushUrl", msg.url);
        // Persist the exact set of token paths we expect the JSON to have once
        // the PR is merged. The auto-clear in tokens-fetched compares cached
        // paths to this set — handles addition + deletion pushes symmetrically
        // (value parity alone misses deleted paths that are still pre-merge).
        await figma.clientStorage.setAsync(
          "expectedPostMergePaths",
          cachedTokens.map(t => t.path)
        );
        const drifts = await checkLocalDesync();
        figma.ui.postMessage({ type: "local-desync-computed", drifts });
      }
      figma.notify(`✓ PR created`);
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
