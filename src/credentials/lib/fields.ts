export type FieldKey = "username" | "password" | "firstName" | "lastName" | "site";

export interface FieldDef {
  key: FieldKey;
  label: string;
  /** Lower-cased, accent-free header names that auto-match this field. */
  aliases: string[];
}

/** Fields in the same order the original TUI expected the columns. */
export const FIELDS: FieldDef[] = [
  {
    key: "username",
    label: "Username",
    aliases: ["username", "user", "usuario", "user name", "login", "nombre de usuario"],
  },
  {
    key: "password",
    label: "Password",
    aliases: ["password", "pass", "contrasena", "clave", "pwd"],
  },
  {
    key: "firstName",
    label: "First names",
    aliases: ["first names", "first name", "firstname", "first", "nombres", "nombre", "given name", "given names"],
  },
  {
    key: "lastName",
    label: "Last names",
    aliases: ["last names", "last name", "lastname", "last", "apellidos", "apellido", "surname", "surnames", "family name"],
  },
  {
    key: "site",
    label: "Site",
    aliases: ["site", "sede", "location", "lugar", "venue"],
  },
];

/** Column index assigned to each field, or null when unassigned. */
export type Mapping = Record<FieldKey, number | null>;

export const EMPTY_MAPPING: Mapping = {
  username: null,
  password: null,
  firstName: null,
  lastName: null,
  site: null,
};

export function requiredFields(groupBySite: boolean): FieldKey[] {
  return FIELDS.map((f) => f.key).filter((k) => groupBySite || k !== "site");
}

export interface User {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  site: string;
}
