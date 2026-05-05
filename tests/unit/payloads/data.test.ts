import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../../../src/modules/payloads/registry";
import payloadsModule from "../../../src/modules/payloads/index";

describe("payload categories registry", () => {
  it("ships at least one category", () => {
    expect(CATEGORIES.length).toBeGreaterThan(0);
  });

  it("ships the v1 set: XSS and SQLi only", () => {
    const ids = CATEGORIES.map((c) => c.id).sort();
    expect(ids).toEqual(["sqli", "xss"]);
  });

  it("each category has unique id and label across the bundle", () => {
    const ids = CATEGORIES.map((c) => c.id);
    const labels = CATEGORIES.map((c) => c.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("payload entries", () => {
  for (const category of CATEGORIES) {
    describe(`category ${category.id}`, () => {
      it("has between 15 and 25 entries (breadth target)", () => {
        expect(category.entries.length).toBeGreaterThanOrEqual(15);
        expect(category.entries.length).toBeLessThanOrEqual(25);
      });

      it("entry ids are unique within the category", () => {
        const ids = category.entries.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("every entry has non-empty label, payload, notes", () => {
        for (const entry of category.entries) {
          expect(entry.label.length, `label of ${entry.id}`).toBeGreaterThan(0);
          expect(entry.payload.length, `payload of ${entry.id}`).toBeGreaterThan(
            0,
          );
          expect(entry.notes.length, `notes of ${entry.id}`).toBeGreaterThan(0);
        }
      });

      it("every entry has a tags array (possibly empty)", () => {
        for (const entry of category.entries) {
          expect(Array.isArray(entry.tags), `tags of ${entry.id}`).toBe(true);
        }
      });

      it("ids are kebab-case", () => {
        const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;
        for (const entry of category.entries) {
          expect(kebab.test(entry.id), `id ${entry.id}`).toBe(true);
        }
      });
    });
  }
});

describe("payloads MimirModule export", () => {
  it("exports id, category, label and component", () => {
    expect(payloadsModule.id).toBe("payloads");
    expect(payloadsModule.category).toBe("payloads");
    expect(payloadsModule.label.length).toBeGreaterThan(0);
    expect(typeof payloadsModule.component).toBe("function");
  });

  it("does not declare a context-menu (browse-and-copy module)", () => {
    expect(payloadsModule.contextMenu).toBeUndefined();
  });
});
