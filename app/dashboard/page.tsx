"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { createClient } from "@/lib/supabaseClient";
import {
  Contact,
  TAGS,
  SCRIPT,
  ALL_QIDS,
  emptyContact,
  todayISO,
  addDays,
  fmtDate,
  daysBetween,
  dueDate,
  isDueToday,
  isLate,
  uid,
} from "@/lib/types";
import { parseDateFlexible, extractNameFromRecord, collapseSpaces } from "@/lib/csvImport";

type Tab = "today" | "contacts" | "script" | "stats";

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [userEmail, setUserEmail] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("today");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [isNewContact, setIsNewContact] = useState(false);
  const [draft, setDraft] = useState<Contact | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Partial<Contact>[]>([]);
  const [csvPaste, setCsvPaste] = useState("");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterPromo, setFilterPromo] = useState("");

  // ---- auth + initial load + realtime ----
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email || ""));

    let active = true;
    supabase
      .from("contacts")
      .select("*")
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data) setContacts(data as Contact[]);
        setLoaded(true);
      });

    const channel = supabase
      .channel("contacts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => {
        supabase
          .from("contacts")
          .select("*")
          .then(({ data, error }) => {
            if (!error && data) setContacts(data as Contact[]);
          });
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // ---- CRUD ----
  async function saveContact(c: Contact) {
    setContacts((prev) => {
      const idx = prev.findIndex((x) => x.id === c.id);
      if (idx === -1) return [...prev, c];
      const next = [...prev];
      next[idx] = c;
      return next;
    });
    const { id, ...rest } = c;
    const { error } = await supabase.from("contacts").upsert({ id, ...rest });
    if (error) console.error(error);
  }

  async function deleteContact(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) console.error(error);
  }

  async function toggleField(id: string, field: "needs_promo" | "promo_sent", value: boolean) {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    await supabase.from("contacts").update({ [field]: value }).eq("id", id);
  }

  function openDetail(id: string) {
    const c = contacts.find((x) => x.id === id);
    if (!c) return;
    setActiveId(id);
    setIsNewContact(false);
    setDraft({ ...c, checklist_notes: { ...c.checklist_notes }, tags: [...c.tags] });
  }
  function openNewContact() {
    const id = uid();
    const c = emptyContact(id);
    setActiveId(id);
    setIsNewContact(true);
    setDraft(c);
  }
  function closeModal(discardIfEmptyNew = true) {
    if (discardIfEmptyNew && isNewContact && draft && !draft.name && !draft.phone) {
      // rien à faire, on n'a jamais sauvegardé de brouillon vide
    }
    setActiveId(null);
    setDraft(null);
    setIsNewContact(false);
  }
  async function handleSaveModal() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.phone.trim()) {
      alert("Nom et téléphone sont requis");
      return;
    }
    await saveContact({ ...draft, updated_at: new Date().toISOString() });
    closeModal(false);
  }
  async function handleDeleteModal() {
    if (!activeId) return;
    if (!confirm("Supprimer ce contact ?")) return;
    await deleteContact(activeId);
    closeModal(false);
  }

  // ---- CSV import ----
  function handleParseCsv(text: string) {
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const fields = (parsed.meta.fields || []).map((f) => f.toLowerCase());
    const isAttio = fields.some((f) => f.includes("record")) && fields.some((f) => f.includes("téléphone") || f.includes("telephone"));

    const existing = new Set(contacts.map((c) => (c.phone || "").replace(/\s+/g, "")));
    const rows: Partial<Contact>[] = [];

    for (const row of parsed.data) {
      let name = "", phone = "", bookingDate: string | null = null;
      if (isAttio) {
        const recordKey = Object.keys(row).find((k) => k.toLowerCase().includes("record"));
        const phoneKey = Object.keys(row).find((k) => k.toLowerCase().includes("téléphone") || k.toLowerCase().includes("telephone"));
        const dateKey = Object.keys(row).find((k) => k.toLowerCase().includes("date"));
        name = extractNameFromRecord(recordKey ? row[recordKey] : "");
        phone = collapseSpaces(phoneKey ? row[phoneKey] : "");
        bookingDate = parseDateFlexible(dateKey ? row[dateKey] : "") || todayISO();
      } else {
        const nameKey = Object.keys(row).find((k) => k.toLowerCase().includes("nom"));
        const phoneKey = Object.keys(row).find((k) => k.toLowerCase().includes("tel"));
        const dateKey = Object.keys(row).find((k) => k.toLowerCase().includes("date"));
        name = collapseSpaces(nameKey ? row[nameKey] : "");
        phone = collapseSpaces(phoneKey ? row[phoneKey] : "");
        bookingDate = parseDateFlexible(dateKey ? row[dateKey] : "") || todayISO();
      }
      const cleanPhone = phone.replace(/\s+/g, "");
      if (!cleanPhone || existing.has(cleanPhone)) continue;
      existing.add(cleanPhone);
      rows.push({
        id: uid(),
        name: name || "Contact",
        phone,
        booking_date: bookingDate,
        status: "a_appeler",
        tags: [],
        notes: "",
        checklist_notes: {},
        issue_note: "",
        caller: "",
        needs_promo: false,
        promo_sent: false,
      });
    }
    setImportRows(rows);
  }

  async function confirmImport() {
    if (!importRows.length) return;
    const now = new Date().toISOString();
    const full = importRows.map((r) => ({ ...emptyContact(r.id as string), ...r, created_at: now, updated_at: now }));
    setContacts((prev) => [...prev, ...(full as Contact[])]);
    const { error } = await supabase.from("contacts").insert(full);
    if (error) console.error(error);
    setImportOpen(false);
    setImportRows([]);
    setCsvPaste("");
  }

  // ---- derived lists ----
  const todayList = useMemo(
    () => contacts.filter(isDueToday).sort((a, b) => dueDate(a).localeCompare(dueDate(b))),
    [contacts]
  );
  const filteredContacts = useMemo(() => {
    const q = search.toLowerCase();
    return contacts
      .filter((c) => {
        if (q && !(c.name.toLowerCase().includes(q) || c.phone.includes(q))) return false;
        if (filterStatus && c.status !== filterStatus) return false;
        if (filterTag && !c.tags.includes(filterTag)) return false;
        if (filterPromo === "yes" && !c.needs_promo) return false;
        if (filterPromo === "no" && c.needs_promo) return false;
        if (filterPromo === "sent" && !c.promo_sent) return false;
        if (filterPromo === "notsent" && (!c.needs_promo || c.promo_sent)) return false;
        return true;
      })
      .sort((a, b) => (a.booking_date || "").localeCompare(b.booking_date || ""));
  }, [contacts, search, filterStatus, filterTag, filterPromo]);

  const negativeFeedback = useMemo(() => {
    return contacts
      .filter((c) => (c.issue_note || "").trim())
      .map((c) => ({ name: c.name, bookingRef: c.booking_ref, bookingDate: c.booking_date, text: c.issue_note.trim() }))
      .sort((a, b) => (b.bookingDate || "").localeCompare(a.bookingDate || ""));
  }, [contacts]);

  if (!loaded) {
    return <div style={{ padding: 40 }}>Chargement…</div>;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div className="brand-text">
            <h1>Suivi Appels</h1>
            <p>Retours clients J+3</p>
          </div>
        </div>

        <div className="caller-field">
          <label>Connecté(e)</label>
          <input type="text" value={userEmail} readOnly />
        </div>

        <nav className="tabs">
          <TabButton active={tab === "today"} onClick={() => setTab("today")} icon="📞" label="À appeler aujourd'hui" count={todayList.length} />
          <TabButton active={tab === "contacts"} onClick={() => setTab("contacts")} icon="📇" label="Tous les contacts" count={contacts.length} />
          <TabButton active={tab === "script"} onClick={() => setTab("script")} icon="📋" label="Script d'appel" />
          <TabButton active={tab === "stats"} onClick={() => setTab("stats")} icon="📊" label="Suivi & stats" />
        </nav>

        <div className="sidebar-foot">
          <button className="btn btn-sm" style={{ width: "100%" }} onClick={handleLogout}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <main>
        {tab === "today" && (
          <TodayPanel list={todayList} onOpen={openDetail} onAdd={openNewContact} onTogglePromo={toggleField} allCount={contacts.length} />
        )}
        {tab === "contacts" && (
          <ContactsPanel
            list={filteredContacts}
            total={contacts.length}
            onOpen={openDetail}
            onAdd={openNewContact}
            onImport={() => setImportOpen(true)}
            onTogglePromo={toggleField}
            search={search}
            setSearch={setSearch}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            filterTag={filterTag}
            setFilterTag={setFilterTag}
            filterPromo={filterPromo}
            setFilterPromo={setFilterPromo}
          />
        )}
        {tab === "script" && <ScriptPanel />}
        {tab === "stats" && <StatsPanel contacts={contacts} negativeFeedback={negativeFeedback} />}
      </main>

      {draft && (
        <ContactModal
          draft={draft}
          setDraft={setDraft}
          onClose={() => closeModal(true)}
          onSave={handleSaveModal}
          onDelete={handleDeleteModal}
        />
      )}

      {importOpen && (
        <ImportModal
          csvPaste={csvPaste}
          setCsvPaste={setCsvPaste}
          rows={importRows}
          onParse={handleParseCsv}
          onClose={() => {
            setImportOpen(false);
            setImportRows([]);
            setCsvPaste("");
          }}
          onConfirm={confirmImport}
        />
      )}
    </div>
  );
}

/* ================= sous-composants ================= */

function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: string; label: string; count?: number }) {
  return (
    <button className={"tab-btn" + (active ? " active" : "")} onClick={onClick}>
      <span className="ico">{icon}</span>
      {label}
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );
}

function StatusPill({ c }: { c: Contact }) {
  if (c.status === "traite") return <span className="pill pill-done">✓ Traité</span>;
  if (isLate(c)) return <span className="pill pill-late">En retard</span>;
  return <span className="pill pill-todo">À appeler</span>;
}
function TagChips({ tags }: { tags: string[] }) {
  if (!tags?.length) return <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>;
  return (
    <div className="tag-list-cell">
      {tags.map((t) => (
        <span className="tag-chip" key={t}>
          {t}
        </span>
      ))}
    </div>
  );
}
function StatCard({ n, label, cls }: { n: number | string; label: string; cls?: string }) {
  return (
    <div className={"stat-card " + (cls || "")}>
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </div>
  );
}

function TodayPanel({
  list,
  onOpen,
  onAdd,
  onTogglePromo,
  allCount,
}: {
  list: Contact[];
  onOpen: (id: string) => void;
  onAdd: () => void;
  onTogglePromo: (id: string, field: "needs_promo" | "promo_sent", value: boolean) => void;
  allCount: number;
}) {
  const late = list.filter(isLate).length;
  const done = allCount; // placeholder, recalculated below with real data in parent if needed
  return (
    <section className="panel active">
      <div className="page-head">
        <div>
          <h2>À appeler aujourd'hui</h2>
          <div className="sub">Clients dont la première réservation date d'il y a 3 jours ou plus, pas encore rappelés.</div>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={onAdd}>
            + Ajouter un contact
          </button>
        </div>
      </div>
      <div className="stat-row">
        <StatCard n={list.length} label="À appeler aujourd'hui" cls="accent" />
        <StatCard n={late} label="En retard" cls={late ? "danger" : ""} />
      </div>
      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Téléphone</th>
                <th>N° booking</th>
                <th>Réservé le</th>
                <th>Date événement</th>
                <th>Échéance</th>
                <th>Tags</th>
                <th>Besoin de code promo</th>
                <th>Code promo envoyé</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!list.length && (
                <tr>
                  <td colSpan={11}>
                    <div className="empty-state">
                      <div className="ico">🎉</div>Aucun appel en attente pour aujourd&apos;hui.
                    </div>
                  </td>
                </tr>
              )}
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="name-cell">
                    <strong>{c.name}</strong>
                    <span>{isLate(c) ? `${daysBetween(dueDate(c), todayISO())}j de retard` : "échéance aujourd'hui"}</span>
                  </td>
                  <td className="mono">{c.phone}</td>
                  <td className="mono">{c.booking_ref || "—"}</td>
                  <td className="mono">{fmtDate(c.booking_date)}</td>
                  <td className="mono">{c.event_date ? fmtDate(c.event_date) : "—"}</td>
                  <td className="mono">{fmtDate(dueDate(c))}</td>
                  <td>
                    <TagChips tags={c.tags} />
                  </td>
                  <td className="promo-cell">
                    <input type="checkbox" checked={c.needs_promo} onChange={(e) => onTogglePromo(c.id, "needs_promo", e.target.checked)} />
                  </td>
                  <td className="promo-cell">
                    <input type="checkbox" checked={c.promo_sent} onChange={(e) => onTogglePromo(c.id, "promo_sent", e.target.checked)} />
                  </td>
                  <td>
                    <StatusPill c={c} />
                  </td>
                  <td>
                    <button className="btn btn-sm btn-primary" onClick={() => onOpen(c.id)}>
                      Appeler
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ContactsPanel(props: {
  list: Contact[];
  total: number;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onImport: () => void;
  onTogglePromo: (id: string, field: "needs_promo" | "promo_sent", value: boolean) => void;
  search: string;
  setSearch: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  filterTag: string;
  setFilterTag: (v: string) => void;
  filterPromo: string;
  setFilterPromo: (v: string) => void;
}) {
  const { list, total, onOpen, onAdd, onImport, onTogglePromo } = props;
  return (
    <section className="panel active">
      <div className="page-head">
        <div>
          <h2>Tous les contacts</h2>
          <div className="sub">Liste complète, import CSV et ajout manuel — triée par ancienneté.</div>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={onImport}>
            ↑ Importer un CSV
          </button>
          <button className="btn btn-primary" onClick={onAdd}>
            + Ajouter un contact
          </button>
        </div>
      </div>
      <div className="toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="Rechercher un nom ou un numéro…"
          value={props.search}
          onChange={(e) => props.setSearch(e.target.value)}
        />
        <select className="filter-select" value={props.filterStatus} onChange={(e) => props.setFilterStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="a_appeler">À appeler</option>
          <option value="traite">Traité</option>
        </select>
        <select className="filter-select" value={props.filterTag} onChange={(e) => props.setFilterTag(e.target.value)}>
          <option value="">Tous les tags</option>
          {TAGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="filter-select" value={props.filterPromo} onChange={(e) => props.setFilterPromo(e.target.value)}>
          <option value="">Code promo : tous</option>
          <option value="yes">Besoin d&apos;un code promo</option>
          <option value="no">Sans besoin de code promo</option>
          <option value="sent">Code promo envoyé</option>
          <option value="notsent">Code promo à envoyer</option>
        </select>
      </div>
      <div className="table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Téléphone</th>
                <th>N° booking</th>
                <th>Réservé le</th>
                <th>Date événement</th>
                <th>Tags</th>
                <th>Besoin de code promo</th>
                <th>Code promo envoyé</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!list.length && (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">
                      <div className="ico">📭</div>Aucun contact. Importez un CSV ou ajoutez-en un.
                    </div>
                  </td>
                </tr>
              )}
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="name-cell">
                    <strong>{c.name}</strong>
                  </td>
                  <td className="mono">{c.phone}</td>
                  <td className="mono">{c.booking_ref || "—"}</td>
                  <td className="mono">{fmtDate(c.booking_date)}</td>
                  <td className="mono">{c.event_date ? fmtDate(c.event_date) : "—"}</td>
                  <td>
                    <TagChips tags={c.tags} />
                  </td>
                  <td className="promo-cell">
                    <input type="checkbox" checked={c.needs_promo} onChange={(e) => onTogglePromo(c.id, "needs_promo", e.target.checked)} />
                  </td>
                  <td className="promo-cell">
                    <input type="checkbox" checked={c.promo_sent} onChange={(e) => onTogglePromo(c.id, "promo_sent", e.target.checked)} />
                  </td>
                  <td>
                    <StatusPill c={c} />
                  </td>
                  <td>
                    <button className="btn btn-sm" onClick={() => onOpen(c.id)}>
                      Ouvrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ScriptPanel() {
  return (
    <section className="panel active">
      <div className="page-head">
        <div>
          <h2>Script d&apos;appel</h2>
          <div className="sub">Trame de référence pour l&apos;entretien téléphonique.</div>
        </div>
      </div>
      <div className="script-card">
        <div className="script-intro">
          Cette version est une aide-mémoire libre. Pour associer les réponses à un client précis, ouvrez sa fiche depuis « À appeler
          aujourd&apos;hui » ou « Tous les contacts ».
        </div>
        {SCRIPT.map((sec) => (
          <div className="script-section" key={sec.key}>
            <h4>{sec.title}</h4>
            {sec.questions.map((q) => (
              <div className="qa-row" key={q.id}>
                <div className="qa-text">
                  <div className="q">{q.q}</div>
                  {q.h && <div className="h">{q.h}</div>}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function StatsPanel({
  contacts,
  negativeFeedback,
}: {
  contacts: Contact[];
  negativeFeedback: { name: string; bookingRef: string; bookingDate: string | null; text: string }[];
}) {
  const today = contacts.filter(isDueToday);
  const done = contacts.filter((c) => c.status === "traite");
  const tagCounts: Record<string, number> = {};
  TAGS.forEach((t) => (tagCounts[t] = 0));
  contacts.forEach((c) => c.tags.forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
  const maxTag = Math.max(1, ...Object.values(tagCounts));

  const srcCounts: Record<string, number> = {};
  contacts.forEach((c) => {
    const v = (c.checklist_notes?.q9 || "").trim();
    if (v) srcCounts[v] = (srcCounts[v] || 0) + 1;
  });
  const srcKeys = Object.keys(srcCounts).sort((a, b) => srcCounts[b] - srcCounts[a]);
  const maxSrc = Math.max(1, ...Object.values(srcCounts));

  return (
    <section className="panel active">
      <div className="page-head">
        <div>
          <h2>Suivi &amp; statistiques</h2>
          <div className="sub">Vue d&apos;ensemble de la campagne d&apos;appels.</div>
        </div>
      </div>
      <div className="stat-row">
        <StatCard n={contacts.length} label="Contacts au total" />
        <StatCard n={today.length} label="À appeler aujourd'hui" cls="accent" />
        <StatCard n={done.length} label="Traités" cls="success" />
        <StatCard n={contacts.length ? Math.round((done.length / contacts.length) * 100) + "%" : "—"} label="Taux de traitement" />
      </div>
      <div className="stats-grid">
        <div className="bar-card">
          <h3>Répartition par tag</h3>
          {TAGS.map((t) => (
            <div className="bar-row" key={t}>
              <div className="label">{t}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(tagCounts[t] / maxTag) * 100}%` }} />
              </div>
              <div className="val">{tagCounts[t]}</div>
            </div>
          ))}
        </div>
        <div className="bar-card">
          <h3>Comment ils nous ont connu</h3>
          {!srcKeys.length && (
            <div style={{ color: "var(--text-faint)", fontSize: 12.5 }}>Pas encore de réponses à « comment nous avez-vous connu ? »</div>
          )}
          {srcKeys.map((k) => (
            <div className="bar-row" key={k}>
              <div className="label">{k}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(srcCounts[k] / maxSrc) * 100}%` }} />
              </div>
              <div className="val">{srcCounts[k]}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="bar-card" style={{ marginTop: 16, maxWidth: 760 }}>
        <h3>Points à améliorer</h3>
        <div className="sub" style={{ color: "var(--text-muted)", fontSize: 12.5, margin: "-8px 0 14px" }}>
          Alimenté automatiquement par le champ « ⚠️ Points négatifs à améliorer » rempli sur la fiche de chaque contact.
        </div>
        {!negativeFeedback.length && (
          <div style={{ color: "var(--text-faint)", fontSize: 12.5 }}>Aucun point négatif noté pour le moment.</div>
        )}
        {negativeFeedback.map((r, i) => (
          <div className="feedback-item" key={i}>
            <div className="fb-head">
              <span className="fb-name">{r.name}</span>
              {r.bookingRef && <span className="fb-date mono">N° {r.bookingRef}</span>}
            </div>
            <div className="fb-note">{r.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContactModal({
  draft,
  setDraft,
  onClose,
  onSave,
  onDelete,
}: {
  draft: Contact;
  setDraft: (c: Contact) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  function set<K extends keyof Contact>(key: K, value: Contact[K]) {
    setDraft({ ...draft, [key]: value });
  }
  function toggleTag(t: string) {
    const has = draft.tags.includes(t);
    set("tags", has ? draft.tags.filter((x) => x !== t) : [...draft.tags, t]);
  }
  function setNote(qid: string, value: string) {
    set("checklist_notes", { ...draft.checklist_notes, [qid]: value });
  }

  return (
    <div className="overlay open">
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>{draft.name || "Contact"}</h3>
            <div className="meta">
              Réservé le {fmtDate(draft.booking_date)} · échéance {fmtDate(dueDate(draft))}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="field-row">
            <div className="field">
              <label>Nom</label>
              <input type="text" value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="field">
              <label>Téléphone</label>
              <input type="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Date de réservation</label>
              <input type="date" value={draft.booking_date || ""} onChange={(e) => set("booking_date", e.target.value)} />
            </div>
            <div className="field">
              <label>N° de booking</label>
              <input type="text" placeholder="ex: B260850496" value={draft.booking_ref} onChange={(e) => set("booking_ref", e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Date de l&apos;événement</label>
            <input type="date" value={draft.event_date || ""} onChange={(e) => set("event_date", e.target.value)} />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="promo-field">
                <input type="checkbox" checked={draft.needs_promo} onChange={(e) => set("needs_promo", e.target.checked)} /> Besoin de code
                promo
              </label>
            </div>
            <div className="field">
              <label className="promo-field">
                <input type="checkbox" checked={draft.promo_sent} onChange={(e) => set("promo_sent", e.target.checked)} /> Code promo envoyé
              </label>
            </div>
          </div>

          <div className="field">
            <label>Statut</label>
            <div className="status-toggle">
              <button type="button" className={"sel-todo" + (draft.status === "a_appeler" ? " active" : "")} onClick={() => set("status", "a_appeler")}>
                À appeler
              </button>
              <button type="button" className={"sel-done" + (draft.status === "traite" ? " active" : "")} onClick={() => set("status", "traite")}>
                Traité
              </button>
            </div>
          </div>

          <div className="field">
            <label>Tags</label>
            <div className="tag-picker">
              {TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={"tag-opt" + (draft.tags.includes(t) ? " sel" : "")}
                  onClick={() => toggleTag(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {SCRIPT.map((sec) => (
            <div className="script-section" key={sec.key}>
              <h4>{sec.title}</h4>
              {sec.questions.map((q) => (
                <div className="qa-row" key={q.id}>
                  <div className="qa-text">
                    <div className="q">{q.q}</div>
                    {q.h && <div className="h">{q.h}</div>}
                    <input
                      type="text"
                      placeholder="Note rapide…"
                      value={draft.checklist_notes[q.id] || ""}
                      onChange={(e) => setNote(q.id, e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}

          <div className="field">
            <label>Notes libres</label>
            <textarea placeholder="Autres infos utiles pour le business…" value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          <div className="field">
            <label>
              ⚠️ Points négatifs à améliorer{" "}
              <span style={{ fontWeight: 400, color: "var(--text-faint)", textTransform: "none", letterSpacing: "normal" }}>
                (remonte automatiquement dans « Suivi &amp; stats »)
              </span>
            </label>
            <textarea
              placeholder="ex : certaines photos ne correspondaient pas à la réalité"
              value={draft.issue_note}
              onChange={(e) => set("issue_note", e.target.value)}
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-danger btn-ghost" onClick={onDelete}>
            Supprimer ce contact
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={onClose}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={onSave}>
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportModal({
  csvPaste,
  setCsvPaste,
  rows,
  onParse,
  onClose,
  onConfirm,
}: {
  csvPaste: string;
  setCsvPaste: (v: string) => void;
  rows: Partial<Contact>[];
  onParse: (text: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(onParse);
  }
  return (
    <div className="overlay open">
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>Importer des contacts</h3>
            <div className="meta">Nom / téléphone / date de réservation — ou un export brut Attio, détecté automatiquement</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <label className="dropzone">
            <div>📄 Cliquez pour choisir un fichier .csv, ou collez le contenu ci-dessous</div>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} />
          </label>
          <div className="field" style={{ marginTop: 12 }}>
            <textarea
              placeholder="nom,telephone,date_resa..."
              style={{ minHeight: 90, fontFamily: "var(--font-mono)", fontSize: 12 }}
              value={csvPaste}
              onChange={(e) => setCsvPaste(e.target.value)}
            />
          </div>
          <button className="btn btn-sm" onClick={() => onParse(csvPaste)}>
            Prévisualiser
          </button>
          {rows.length > 0 && (
            <div className="import-preview">
              <p className="import-note">{rows.length} contact(s) prêt(s) à être importés (doublons déjà écartés).</p>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <span className="meta">{rows.length ? `${rows.length} contact(s)` : ""}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={onClose}>
              Annuler
            </button>
            <button className="btn btn-primary" disabled={!rows.length} onClick={onConfirm}>
              Importer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
