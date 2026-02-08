import { describe, expect, it } from "vitest";
import { generateCitationKey, generateDirName } from "./citation-key.js";

describe("Citation Key Generation", () => {
  describe("generateCitationKey", () => {
    it("should generate key from author family name and year", () => {
      expect(generateCitationKey("Smith, J.", "2024")).toBe("smith2024");
    });

    it("should transliterate non-ASCII characters", () => {
      expect(generateCitationKey("Müller, K.", "2023")).toBe("muller2023");
    });

    it("should fallback to unknown for CJK characters", () => {
      expect(generateCitationKey("田中", "2024")).toBe("unknown2024");
    });

    it('should use "unknown" when no author provided', () => {
      expect(generateCitationKey(undefined, "2024")).toBe("unknown2024");
      expect(generateCitationKey("", "2024")).toBe("unknown2024");
    });

    it('should use "0000" when no year provided', () => {
      expect(generateCitationKey("Smith, J.", undefined)).toBe("smith0000");
      expect(generateCitationKey("Smith, J.", "")).toBe("smith0000");
    });

    it('should use "unknown0000" when neither author nor year provided', () => {
      expect(generateCitationKey(undefined, undefined)).toBe("unknown0000");
    });

    it("should handle author with only family name (no comma)", () => {
      expect(generateCitationKey("Smith", "2024")).toBe("smith2024");
    });

    it("should handle multi-word family names by taking first word", () => {
      // "van der Berg" → extract first author's family name → "van"
      // But actually for "van der Berg, J." the family name is "van der Berg"
      // We take the part before the comma and strip to lowercase ASCII
      expect(generateCitationKey("van der Berg, J.", "2024")).toBe("vanderberg2024");
    });

    it("should strip non-alphanumeric characters after transliteration", () => {
      expect(generateCitationKey("O'Brien, K.", "2024")).toBe("obrien2024");
    });

    it("should handle collision suffixes", () => {
      const existing = ["smith2024"];
      expect(generateCitationKey("Smith, J.", "2024", existing)).toBe("smith2024a");
    });

    it("should handle multiple collision suffixes", () => {
      const existing = ["smith2024", "smith2024a"];
      expect(generateCitationKey("Smith, J.", "2024", existing)).toBe("smith2024b");
    });

    it("should handle many collisions", () => {
      const existing = [
        "smith2024",
        ...Array.from({ length: 26 }, (_, i) => `smith2024${String.fromCodePoint(97 + i)}`),
      ];
      // After a-z (26 collisions + base), should continue to aa
      expect(generateCitationKey("Smith, J.", "2024", existing)).toBe("smith2024aa");
    });
  });

  describe("generateDirName", () => {
    it("should append uuid8 suffix to citation key", () => {
      const dirName = generateDirName("smith2024");
      expect(dirName).toMatch(/^smith2024-[0-9a-f]{8}$/);
    });

    it("should generate different dir names each time", () => {
      const dir1 = generateDirName("smith2024");
      const dir2 = generateDirName("smith2024");
      expect(dir1).not.toBe(dir2);
    });

    it("should use provided uuid when given", () => {
      const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
      const dirName = generateDirName("smith2024", uuid);
      expect(dirName).toBe("smith2024-a1b2c3d4");
    });
  });
});
