export type Dict = Record<string, string>;

export function translate(dict: Dict, key: string, vars?: Record<string, string | number>) {
  let s = dict[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}
