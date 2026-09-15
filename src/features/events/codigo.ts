/** Genera un código corto sugerido a partir del nombre. Editable por el admin. */
export function suggestCode(nombre: string): string {
  const clean = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const words = clean.split(/[^A-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return "EVT";
  let code = words.map((w) => w[0]).join("");
  if (code.length < 2) {
    code = (words[0] ?? "EVT").slice(0, 4);
  }
  return code.slice(0, 8);
}
