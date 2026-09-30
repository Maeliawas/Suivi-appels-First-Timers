// Port du parseur d'import CSV / Attio de la version Claude Artifact.

export function collapseSpaces(s: string | undefined | null): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

export function parseDateFlexible(raw: string | undefined | null): string | null {
  if (!raw) return null;
  raw = raw.trim();
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yr = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  return null;
}

function looksLikeName(part: string): boolean {
  const words = part.split(" ").filter(Boolean);
  if (!words.length) return false;
  if (!/^[A-ZÀ-Ý][a-zà-ÿ'\-]+$/.test(words[0])) return false;
  return words.slice(1).some((w) => /^[A-ZÀ-Ý]{2,}$/.test(w));
}
function looksLikeAllCapsName(part: string): boolean {
  const words = part.split(" ").filter(Boolean);
  if (words.length !== 2) return false;
  return words.every((w) => /^[A-ZÀ-Ý][A-ZÀ-Ý'\-]+$/.test(w) && w.length >= 2);
}
function toTitleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length > 1 && w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join(" ");
}
export function extractNameFromRecord(record: string | undefined | null): string {
  if (!record) return "";
  const parts = record
    .split(" - ")
    .map((p) => p.trim())
    .filter(Boolean);
  let candidate = parts.find(looksLikeName);
  if (!candidate) candidate = parts.find(looksLikeAllCapsName);
  if (!candidate) candidate = parts.length >= 2 ? parts[1] : parts[0];
  return collapseSpaces(toTitleCase(candidate || ""));
}
