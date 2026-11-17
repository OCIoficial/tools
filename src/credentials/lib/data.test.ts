import { describe, expect, it } from "vitest";
import { autoMap, detectHeader, groupBySite, parseTable, titleCase, toUsers } from "./data";

describe("parseTable", () => {
  it("parses CSV and pads short rows", () => {
    expect(parseTable("a,b,c\nd,e\n")).toEqual([["a", "b", "c"], ["d", "e", ""]]);
  });
  it("detects tab-separated paste from spreadsheets", () => {
    expect(parseTable("a\tb, c\nd\te")).toEqual([["a", "b, c"], ["d", "e"]]);
  });
  it("throws on empty input", () => {
    expect(() => parseTable("  \n")).toThrow();
  });
});

describe("header detection and mapping", () => {
  it("maps by header names, ignoring case and accents", () => {
    const rows = parseTable("Email,Usuario,Contraseña,Nombres,Apellidos,Sede\nx@y,u,p,f,l,s");
    expect(detectHeader(rows)).toBe(true);
    expect(autoMap(rows, true)).toEqual({ username: 1, password: 2, firstName: 3, lastName: 4, site: 5 });
  });
  it("falls back to positional order without header", () => {
    const rows = parseTable("vvega,NOJQCJ,Victor,Vega,Online");
    expect(detectHeader(rows)).toBe(false);
    expect(autoMap(rows, false)).toEqual({ username: 0, password: 1, firstName: 2, lastName: 3, site: 4 });
  });
});

describe("users", () => {
  it("cleans whitespace, skips empty rows, groups by site in order", () => {
    const rows = [
      ["u1", "p1", " Ana  María ", "Pérez ", "B"],
      ["", "", "", "", ""],
      ["u2", "p2", "Juan", "Soto", "A"],
      ["u3", "p3", "Eva", "Ríos", "B"],
    ];
    const users = toUsers(rows, { username: 0, password: 1, firstName: 2, lastName: 3, site: 4 });
    expect(users).toHaveLength(3);
    expect(users[0].firstName).toBe("Ana María");
    const groups = groupBySite(users);
    expect([...groups.keys()]).toEqual(["B", "A"]);
    expect(groups.get("B")).toHaveLength(2);
  });
});

describe("titleCase", () => {
  it("matches Python str.title()", () => {
    expect(titleCase("josé ÁNGEL san martín")).toBe("José Ángel San Martín");
    expect(titleCase("violeta (axel) o'neil")).toBe("Violeta (Axel) O'Neil");
  });
});
