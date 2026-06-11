import { describe, it, expect } from "vitest";
import {
  hexToComponents,
  generateColorsetContents,
  flattenColorTokens,
} from "./generate-xcassets";

// --- hexToComponents ---

describe("hexToComponents", () => {
  it("converts a 6-digit hex to RGBA components", () => {
    expect(hexToComponents("#FFFFFF")).toEqual({
      red: "1.000",
      green: "1.000",
      blue: "1.000",
      alpha: "1.000",
    });
  });

  it("converts a 6-digit hex without #", () => {
    expect(hexToComponents("000000")).toEqual({
      red: "0.000",
      green: "0.000",
      blue: "0.000",
      alpha: "1.000",
    });
  });

  it("expands a 3-digit hex", () => {
    expect(hexToComponents("#FFF")).toEqual({
      red: "1.000",
      green: "1.000",
      blue: "1.000",
      alpha: "1.000",
    });
  });

  it("converts an 8-digit hex with alpha", () => {
    // #00000080 → alpha = 0x80 / 255 = 128 / 255 ≈ 0.502
    const result = hexToComponents("#00000080");
    expect(result.red).toBe("0.000");
    expect(result.green).toBe("0.000");
    expect(result.blue).toBe("0.000");
    expect(result.alpha).toBe("0.502");
  });

  it("converts a fully transparent color", () => {
    const result = hexToComponents("#00000000");
    expect(result.alpha).toBe("0.000");
  });

  it("converts a mid-range color correctly", () => {
    // #1770DE = r:23 g:112 b:222
    const result = hexToComponents("#1770DE");
    expect(result.red).toBe("0.090");
    expect(result.green).toBe("0.439");
    expect(result.blue).toBe("0.871");
    expect(result.alpha).toBe("1.000");
  });
});

// --- generateColorsetContents ---

describe("generateColorsetContents", () => {
  it("generates a light-only colorset", () => {
    const result = generateColorsetContents("#FFFFFF") as any;
    expect(result.colors).toHaveLength(1);
    expect(result.colors[0].idiom).toBe("universal");
    expect(result.colors[0].appearances).toBeUndefined();
    expect(result.info).toEqual({ author: "xcode", version: 1 });
  });

  it("generates a light + dark colorset", () => {
    const result = generateColorsetContents("#FFFFFF", "#000000") as any;
    expect(result.colors).toHaveLength(2);

    const darkEntry = result.colors[1];
    expect(darkEntry.appearances).toEqual([
      { appearance: "luminosity", value: "dark" },
    ]);
    expect(darkEntry.color.components.red).toBe("0.000");
  });

  it("light entry has no appearances field", () => {
    const result = generateColorsetContents("#FFFFFF", "#000000") as any;
    expect(result.colors[0].appearances).toBeUndefined();
  });

  it("uses srgb color space", () => {
    const result = generateColorsetContents("#FFFFFF") as any;
    expect(result.colors[0].color["color-space"]).toBe("srgb");
  });

  it("correctly sets alpha from 8-digit hex", () => {
    const result = generateColorsetContents("#0000004D") as any;
    // 0x4D = 77 → 77/255 ≈ 0.302
    expect(result.colors[0].color.components.alpha).toBe("0.302");
  });
});

// --- flattenColorTokens ---

describe("flattenColorTokens", () => {
  it("extracts a simple color token", () => {
    const input = {
      main: {
        $type: "color",
        $value: { light: "#FFFFFF", dark: "#000000" },
      },
    };
    const result = flattenColorTokens(input, ["loop", "color"]);
    expect(result).toHaveLength(1);
    expect(result[0].pathParts).toEqual(["loop", "color", "main"]);
    expect(result[0].light).toBe("#FFFFFF");
    expect(result[0].dark).toBe("#000000");
  });

  it("renames _base to base in the path", () => {
    const input = {
      main: {
        _base: {
          $type: "color",
          $value: { light: "#FFFFFF", dark: "#000000" },
        },
      },
    };
    const result = flattenColorTokens(input, ["loop", "color"]);
    expect(result[0].pathParts).toEqual(["loop", "color", "main", "base"]);
  });

  it("ignores dark value when darkPlaceholder is true", () => {
    const input = {
      main: {
        $type: "color",
        $value: { light: "#FFFFFF", dark: "#95FF00" },
        $extensions: { "somfy.darkPlaceholder": true },
      },
    };
    const result = flattenColorTokens(input, ["loop", "color"]);
    expect(result[0].light).toBe("#FFFFFF");
    expect(result[0].dark).toBeUndefined();
  });

  it("skips tokens with empty light value", () => {
    const input = {
      hover: {
        $type: "color",
        $value: { light: "", dark: "" },
      },
    };
    const result = flattenColorTokens(input, ["loop", "color"]);
    expect(result).toHaveLength(0);
  });

  it("ignores keys starting with $", () => {
    const input = {
      $description: "should be ignored",
      main: {
        $type: "color",
        $value: { light: "#FFFFFF", dark: "#000000" },
      },
    };
    const result = flattenColorTokens(input, ["loop", "color"]);
    expect(result).toHaveLength(1);
  });

  it("flattens nested structure", () => {
    const input = {
      background: {
        brand: {
          primary: {
            soft: {
              $type: "color",
              $value: { light: "#FEF1CC", dark: "#95FF00" },
              $extensions: { "somfy.darkPlaceholder": true },
            },
            bold: {
              $type: "color",
              $value: { light: "#FAB800", dark: "#95FF00" },
              $extensions: { "somfy.darkPlaceholder": true },
            },
          },
        },
      },
    };
    const result = flattenColorTokens(input, ["loop", "color"]);
    expect(result).toHaveLength(2);
    expect(result[0].pathParts).toEqual([
      "loop", "color", "background", "brand", "primary", "soft",
    ]);
    expect(result[1].pathParts).toEqual([
      "loop", "color", "background", "brand", "primary", "bold",
    ]);
  });

  it("includes dark value when darkPlaceholder is false", () => {
    const input = {
      secondary: {
        $type: "color",
        $value: { light: "#1770DE", dark: "#95FF01" },
      },
    };
    const result = flattenColorTokens(input, ["loop", "color"]);
    expect(result[0].dark).toBe("#95FF01");
  });
});
