export interface Contact {
  id: string;
  name: string;
  phone: string;
  booking_date: string | null;
  booking_ref: string;
  event_date: string | null;
  needs_promo: boolean;
  promo_sent: boolean;
  status: "a_appeler" | "traite";
  tags: string[];
  notes: string;
  checklist_notes: Record<string, string>;
  issue_note: string;
  caller: string;
  created_at: string;
  updated_at: string;
}

export const TAGS = [
  "A un brief",
  "Pas de réponse",
  "Dmd de rappeler",
  "Dmd de RDV",
  "Pas intéressé",
  "Client régulier",
  "À relancer",
  "Bon retour",
  "Mauvais retour",
  "Booking annulé",
];

export interface ScriptQuestion {
  id: string;
  q: string;
  h: string;
}
export interface ScriptSection {
  key: string;
  title: string;
  questions: ScriptQuestion[];
}

export const SCRIPT: ScriptSection[] = [
  {
    key: "platform",
    title: "1. Expérience sur la plateforme",
    questions: [
      { id: "q1", q: "Facilité de recherche des espaces", h: "Filtres pertinents ? Pertinence des résultats (mots-clés, IA) ?" },
      { id: "q2", q: "Clarté du processus de réservation", h: "Assez d'aide et d'informations à disposition ?" },
      { id: "q3", q: "Adéquation des prix avec le budget", h: "Le client trouve-t-il les tarifs raisonnables ?" },
    ],
  },
  {
    key: "host",
    title: "2. Expérience chez l'hôte",
    questions: [
      { id: "q4", q: "Conformité du lieu", h: "Par rapport à l'annonce, éléments manquants le jour J (café, matériel, wifi, informations…)" },
      { id: "q5", q: "Qualité de l'accueil", h: "" },
    ],
  },
  {
    key: "activity",
    title: "3. Activité du client",
    questions: [
      { id: "q7", q: "Typologie d'entreprise", h: "Agence, marque en direct…" },
      { id: "q8", q: "Fréquence des projets", h: "Recherche-t-il des décors régulièrement ?" },
    ],
  },
  {
    key: "bonus",
    title: "Complément",
    questions: [{ id: "q9", q: "Comment nous a-t-il connu ?", h: "Bouche-à-oreille, réseaux, presse, partenaire…" }],
  },
];

export const ALL_QIDS = SCRIPT.reduce<string[]>((a, s) => a.concat(s.questions.map((q) => q.id)), []);

export function emptyContact(id: string): Contact {
  return {
    id,
    name: "",
    phone: "",
    booking_date: todayISO(),
    booking_ref: "",
    event_date: null,
    needs_promo: false,
    promo_sent: false,
    status: "a_appeler",
    tags: [],
    notes: "",
    checklist_notes: {},
    issue_note: "",
    caller: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function todayISO(): string {
  return isoFromDate(new Date());
}
export function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function addDays(iso: string | null, n: number): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoFromDate(d);
}
export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const p = iso.split("-");
  if (p.length !== 3) return "—";
  return `${p[2]}/${p[1]}/${p[0]}`;
}
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
}
export function dueDate(c: Contact): string {
  return addDays(c.booking_date, 3);
}
export function isDueToday(c: Contact): boolean {
  return c.status !== "traite" && dueDate(c) !== "" && dueDate(c) <= todayISO();
}
export function isLate(c: Contact): boolean {
  return c.status !== "traite" && dueDate(c) !== "" && daysBetween(dueDate(c), todayISO()) > 0;
}
export function uid(): string {
  return "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
