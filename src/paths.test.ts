import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getArticleDir, getFulltextDir, getMetaPath, getReadmePath } from "./paths.js";

describe("Path Resolution Utilities", () => {
  const sessionDir = "/data/sessions/20240115_test_abc123";

  describe("getFulltextDir", () => {
    it("should return fulltext directory under session", () => {
      expect(getFulltextDir(sessionDir)).toBe(join(sessionDir, "fulltext"));
    });
  });

  describe("getArticleDir", () => {
    it("should return article directory under fulltext", () => {
      expect(getArticleDir(sessionDir, "smith2024-a1b2c3d4")).toBe(
        join(sessionDir, "fulltext", "smith2024-a1b2c3d4")
      );
    });
  });

  describe("getMetaPath", () => {
    it("should return meta.json path in article directory", () => {
      expect(getMetaPath(sessionDir, "smith2024-a1b2c3d4")).toBe(
        join(sessionDir, "fulltext", "smith2024-a1b2c3d4", "meta.json")
      );
    });
  });

  describe("getReadmePath", () => {
    it("should return README.md path in article directory", () => {
      expect(getReadmePath(sessionDir, "smith2024-a1b2c3d4")).toBe(
        join(sessionDir, "fulltext", "smith2024-a1b2c3d4", "README.md")
      );
    });
  });
});
