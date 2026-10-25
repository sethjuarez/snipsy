import { describe, expect, it } from "vitest";
import { matchScore, matchesQuery, searchItems } from "./search";

describe("matchScore", () => {
  it("matches everything for an empty query", () => {
    expect(matchScore("", "anything")).toBe(0);
    expect(matchScore("   ", "anything")).toBe(0);
  });

  it("ranks prefix > word start > substring > in-order letters", () => {
    expect(matchScore("demo", "demo intro")).toBe(4);
    expect(matchScore("intro", "demo intro")).toBe(3);
    expect(matchScore("tro", "demo intro")).toBe(2);
    expect(matchScore("dmi", "demo intro")).toBe(1);
  });

  it("requires every token and ignores case", () => {
    expect(matchScore("Demo INTRO", "demo intro")).toBe(7);
    expect(matchScore("demo zebra", "demo intro")).toBeNull();
  });
});

describe("matchesQuery", () => {
  it("searches across fields and skips undefined", () => {
    expect(matchesQuery("login", "Sign in", undefined, "login flow")).toBe(true);
    expect(matchesQuery("logout", "Sign in", undefined)).toBe(false);
  });
});

describe("searchItems", () => {
  const items = [
    { name: "Open settings" },
    { name: "Settings sync" },
    { name: "Reset" },
  ];

  it("returns a copy of all items when the query is blank", () => {
    const result = searchItems(items, "", (item) => [item.name]);
    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });

  it("ranks best matches first and drops misses", () => {
    expect(searchItems(items, "set", (item) => [item.name]).map((item) => item.name)).toEqual([
      "Settings sync",
      "Open settings",
      "Reset",
    ]);
    expect(searchItems(items, "sync", (item) => [item.name]).map((item) => item.name)).toEqual(["Settings sync"]);
  });

  it("keeps original order for ties", () => {
    const tied = [{ name: "alpha one" }, { name: "alpha two" }];
    expect(searchItems(tied, "alpha", (item) => [item.name])).toEqual(tied);
  });
});
