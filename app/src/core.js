// ---- Release Notes Agent: core logic (pure functions, no UI, no network) ----
// Expects a global D = {tickets, accounts, support, docs, manifest, expected}

const CORE = (() => {
  const DEFAULT_CFG = Object.freeze({
    supportWindowDays: 90, renewalDays: 60, staleDocDays: 60, batchSize: 25,
    vendorAllow: ["Salesforce", "Yelp", "Facebook", "LinkedIn", "Google"],
    vendorDeny: ["Okta", "Azure AD", "Azure", "Zillow", "HubSpot", "Zendesk", "Freshdesk", "Jira", "Confluence"],
    docSources: ["Confluence", "Google Drive"],
  });
  const withCfg = c => ({ ...DEFAULT_CFG, ...(c || {}) });
  const split = s => (s || "").split(";").map(x => x.trim()).filter(Boolean);
  const day = iso => Date.parse(iso + "T00:00:00Z") / 864e5;
  const addDays = (iso, n) => new Date((day(iso) + n) * 864e5).toISOString().slice(0, 10);
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const has = (text, word) => new RegExp(`(^|[^A-Za-z])${reEsc(word)}([^A-Za-z]|$)`).test(text);
  const namesOf = a => [a.account_name, ...split(a.aliases)];

  // H1/H2/H6: read-only accessor scoped to the release manifest, linked docs and allowed document sources
  function makeReader(manifestIds, cfg) {
    cfg = withCfg(cfg);
    const allowed = new Set(manifestIds), linked = new Set();
    for (const id of manifestIds) {
      const t = D.tickets.find(x => x.ticket_id === id);
      if (t) split(t.linked_docs).forEach(d => linked.add(d));
    }
    return Object.freeze({
      ticket(id) {
        if (!allowed.has(id)) throw new Error(`Access refused: ${id} is not part of this release`);
        const t = D.tickets.find(x => x.ticket_id === id);
        if (!t) throw new Error(`${id} not found in Jira`);
        return { ...t };
      },
      doc(id) {
        if (!linked.has(id)) throw new Error(`Access refused: ${id} is not linked to a ticket in this release`);
        const d = D.docs[id];
        if (!d) throw new Error(`${id} could not be opened`);
        if (!cfg.docSources.includes(d.source)) throw new Error(`${id} is in ${d.source}, which is not an approved document source`);
        return { ...d };
      },
      linkedDocIds: () => [...linked],
    });
  }

  const INJECTION = /(ignore (all |your |the )?(previous|prior) instructions|note to the [\w\s]*bot|system prompt|disregard (the |your )?rules)/i;
  const ROADMAP = /\b(coming soon|will (soon )?be available|in a future release|next (quarter|month|year|release)|later this (year|quarter|month)|on (our|the) roadmap|we plan to|we are planning)\b/i;

  // Customer detection: Jira Customer field first, then full name, then short name (flagged to confirm)
  function detectCustomers(t) {
    const txt = `${t.title} ${t.description}`, found = [], flags = [];
    for (const a of D.accounts) {
      if (t.customer && t.customer === a.account_name) { found.push(a); continue; }
      if (txt.includes(a.account_name)) { found.push(a); continue; }
      const alias = split(a.aliases).find(al => has(txt, al));
      if (alias) { found.push(a); flags.push(`Matched ${a.account_name} by short name "${alias}"; confirm before sending`); }
    }
    return { found, flags };
  }
  function unknownCustomer(t) {
    if (t.customer && !D.accounts.some(a => a.account_name === t.customer)) return t.customer;
    const txt = `${t.title}. ${t.description}`;
    const re = /(?:built for|requested by|pilot for|for)\s+([A-Z][A-Za-z&']+(?:\s+[A-Z][A-Za-z&']+){0,3})/g;
    let m;
    while ((m = re.exec(txt))) {
      const name = m[1].trim();
      const known = D.accounts.some(a => namesOf(a).some(n => n === name || n.startsWith(name) || name.startsWith(n)));
      if (!known) return name;
    }
    return null;
  }

  function classify(manifestIds, reader, releaseDate, cfg) {
    cfg = withCfg(cfg);
    const rows = [];
    for (const id of manifestIds) {
      let t;
      try { t = reader.ticket(id); } catch (e) { rows.push({ id, cls: "Missing", customer: "", reason: e.message, flags: [] }); continue; }
      const flags = [];
      if (INJECTION.test(t.description) || INJECTION.test(t.title)) flags.push("Instruction found in ticket text; it will be ignored and logged");
      for (const d of split(t.linked_docs)) {
        const doc = D.docs[d];
        if (doc && day(doc.last_updated) < day(releaseDate) - cfg.staleDocDays) flags.push(`${d} last updated ${doc.last_updated}, before this release; the ticket wins if they disagree`);
      }
      const { found, flags: cflags } = detectCustomers(t);
      const names = found.map(a => a.account_name).join(", ");
      if (t.customer_visible !== "Y") {
        rows.push({ id, t, cls: "Internal", customer: names, reason: found.length ? "Internal; names a customer (CS context only)" : "Internal change", flags });
      } else if (found.length) {
        rows.push({ id, t, cls: "Customer-specific", customer: names, reason: t.customer ? "Jira Customer field" : "Customer named in subject or description", flags: [...flags, ...cflags] });
      } else {
        const unk = unknownCustomer(t);
        if (unk) rows.push({ id, t, cls: "Needs decision", customer: unk, reason: `Names "${unk}", which is not a known account`, flags });
        else rows.push({ id, t, cls: "General", customer: "", reason: "Customer-visible, no customer named", flags });
      }
    }
    return rows;
  }

  // Risk rules, computed in code. Thresholds come from settings.
  function impact(manifestIds, releaseDate, specificIds, cfg) {
    cfg = withCfg(cfg);
    const w0 = addDays(releaseDate, -cfg.supportWindowDays), soon = addDays(releaseDate, cfg.renewalDays);
    const rel = manifestIds.map(id => D.tickets.find(t => t.ticket_id === id)).filter(Boolean);
    const risk = rel.filter(t => t.customer_visible === "Y" && ["Change", "Action required"].includes(t.type) && !specificIds.has(t.ticket_id));
    const links = {};
    for (const t of rel) if (t.customer_visible === "Y") split(t.linked_support_tickets).forEach(s => (links[s] = t));
    const order = { High: 0, Medium: 1, Low: 2, "Not affected": 3 };
    const rows = D.accounts.map(a => {
      const feats = new Set(split(a.features_used)), conf = new Set(split(a.config));
      const rt = risk.filter(t => feats.has(t.feature_area) && (!t.affects_setting || conf.has(t.affects_setting)));
      const areas = new Set(rt.map(t => t.feature_area));
      const ev = [];
      for (const s of D.support) {
        if (s.account_id !== a.account_id || s.date < w0 || !areas.has(s.feature_area)) continue;
        let sen = s.sentiment;
        if (sen === "negative" && links[s.ticket_id] && ["Fix", "Improvement", "New feature"].includes(links[s.ticket_id].type)) sen = "neutral";
        ev.push({ id: s.ticket_id, sen, subject: s.subject });
      }
      const renSoon = a.renewal_date <= soon, act = rt.some(t => t.type === "Action required");
      let lvl;
      if (!rt.length) lvl = "Not affected";
      else if (ev.some(e => e.sen === "negative") || renSoon) lvl = "High";
      else if (ev.some(e => e.sen === "neutral") || act) lvl = "Medium";
      else lvl = "Low";
      const good = D.support.filter(s => s.account_id === a.account_id && links[s.ticket_id]).map(s => ({ support: s.ticket_id, ticket: links[s.ticket_id].ticket_id, subject: s.subject }));
      return { account: a, level: lvl, riskTickets: rt.map(t => t.ticket_id), evidence: ev, renewalSoon: renSoon, actionRequired: act, good,
        days: Math.round(day(a.renewal_date) - day(releaseDate)) };
    });
    rows.sort((x, y) => order[x.level] - order[y.level] || x.days - y.days);
    return rows;
  }

  // Action-required items per account: Action required tickets, and changes whose ticket says customers must act
  function actionItems(impactRows) {
    const items = [];
    for (const r of impactRows) for (const id of r.riskTickets) {
      const t = D.tickets.find(x => x.ticket_id === id);
      if (t.type === "Action required" || /\bmust\b/i.test(t.description))
        items.push({ account: r.account.account_name, accountId: r.account.account_id, csm: r.account.csm, ticket: id, title: t.title, status: "pending" });
    }
    return items;
  }

  function planNotes(classRows, decisions) {
    const general = classRows.filter(r => r.cls === "General" || (r.cls === "Needs decision" && decisions[r.id] === "general")).map(r => r.id);
    const notes = [{ key: "general", audience: "All customers", account: null, tickets: general }];
    const byAcc = {};
    for (const r of classRows.filter(r => r.cls === "Customer-specific")) for (const name of r.customer.split(", ")) (byAcc[name] = byAcc[name] || []).push(r.id);
    for (const [name, ids] of Object.entries(byAcc)) {
      const a = D.accounts.find(x => x.account_name === name);
      const feats = new Set(split(a.features_used)), conf = new Set(split(a.config));
      const relevant = general.filter(id => {
        const t = D.tickets.find(x => x.ticket_id === id);
        return feats.has(t.feature_area) && (!t.affects_setting || conf.has(t.affects_setting));
      });
      notes.push({ key: a.account_id, audience: name, account: a, tickets: [...ids, ...relevant], specific: ids });
    }
    return notes;
  }
  const noteTitle = (note, mode) => `${mode === "pre-release" ? "pre-release note" : "release note"}_${note.account ? note.account.account_name : "general"}`;

  // Large releases: split a note's tickets into batches by feature area
  function batches(ticketIds, size) {
    if (ticketIds.length <= size) return [ticketIds];
    const byArea = {};
    for (const id of ticketIds) { const t = D.tickets.find(x => x.ticket_id === id); (byArea[t.feature_area] = byArea[t.feature_area] || []).push(id); }
    const out = []; let cur = [];
    for (const ids of Object.values(byArea)) for (const id of ids) { if (cur.length >= size) { out.push(cur); cur = []; } cur.push(id); }
    if (cur.length) out.push(cur);
    return out;
  }

  const SECTIONS = [["action_required", "Action required"], ["new_features", "New features"], ["changes", "Changes"], ["fixes", "Fixes and improvements"]];
  function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function render(note, draft, release, dateLabel, mode) {
    const pre = mode === "pre-release";
    const lines = [], html = [];
    const audienceLabel = note.account ? `Prepared for ${note.account.account_name} · Confidential` : "For all customers";
    const heading = pre ? `Upcoming changes: ${release}` : `Release Notes: ${release}`;
    const sub = pre ? `Planned for release ${release} · Advance notice for ${note.audience}` : `Released ${dateLabel} · Prepared for ${note.audience}`;
    html.push(`<p style="color:#6b7280;font-size:9pt">[Company logo]&nbsp;&nbsp;&nbsp;${esc(audienceLabel)} · Release ${esc(release)}</p>`);
    html.push(`<h1>${esc(heading)}</h1><p style="color:#6b7280">${esc(sub)}</p>`);
    lines.push(heading, sub);
    if (note.account) { html.push(`<p>Hello ${esc(note.account.account_name)} team,</p>`); lines.push(`Hello ${note.account.account_name} team,`); }
    html.push(`<h2>Summary</h2><p>${esc(draft.summary)}</p>`); lines.push("Summary", draft.summary || "");
    for (const [k, label] of SECTIONS) {
      const items = draft[k] || [];
      if (!items.length) continue;
      html.push(`<h2>${label}</h2><ul>`); lines.push(label);
      for (const it of items) {
        const bw = String(it.by_when || "").trim().replace(/^(by|before|no later than)\s+/i, "");
        const when = bw ? ` (by ${bw})` : "";
        html.push(`<li><b>${esc(it.title)}${esc(when)}:</b> ${esc(it.text)}</li>`);
        lines.push(`- ${it.title}${when}: ${it.text}`);
      }
      html.push("</ul>");
    }
    if (draft.help) { html.push(`<h2>Need help?</h2><p>${esc(draft.help)}</p>`); lines.push("Need help?", draft.help); }
    const footer = `${pre ? "Advance notice" : "Release Notes"} | Release ${release} | ${dateLabel}`;
    html.push(`<hr><p style="color:#6b7280;font-size:9pt">${esc(footer)}</p>`);
    lines.push(footer);
    return { text: lines.join("\n"), html: html.join("\n") };
  }
  function sourcesOf(draft) {
    const s = new Set();
    for (const [k] of SECTIONS) for (const it of draft[k] || []) split(String(it.source || "").replace(/,/g, ";")).forEach(x => s.add(x.trim()));
    return s;
  }
  function mergeDrafts(parts) {
    const out = { summary: parts.map(p => p.summary).filter(Boolean).join(" "), help: parts.find(p => p.help)?.help || "", reviewer_flags: [] };
    for (const [k] of SECTIONS) out[k] = parts.flatMap(p => p[k] || []);
    out.reviewer_flags = parts.flatMap(p => p.reviewer_flags || []);
    return out;
  }

  // Code checks: H7–H13, H15, H17 and Q4, Q8
  const ROADMAP_PRE = /\b(coming soon|in a future release|next (quarter|month|year)|later this (year|quarter|month)|on (our|the) roadmap|we plan to|we are planning)\b/i;
  function codeChecks(note, text, sources, cfg, mode) {
    cfg = withCfg(cfg);
    const res = [];
    const add = (id, pass, evidence) => res.push({ id, pass, evidence: pass ? "" : evidence });
    const own = note.account ? note.account.account_id : null;
    const hits = [];
    for (const a of D.accounts) for (const n of namesOf(a)) if (has(text, n)) { hits.push({ a, n }); break; }
    if (has(text, "Evergreen Homes")) hits.push({ a: { account_id: "?", account_name: "Evergreen Homes" }, n: "Evergreen Homes" });
    if (!note.account) add("H7", hits.length === 0, `Customer named: ${hits.map(h => h.n).join(", ")}`);
    else { const others = hits.filter(h => h.a.account_id !== own); add("H8", others.length === 0, `Other customer named: ${others.map(h => h.n).join(", ")}`); }
    const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const phone = (text.match(/\+?\d[\d\s().-]{8,}\d/g) || []).find(p => p.replace(/\D/g, "").length >= 9);
    const people = D.accounts.flatMap(a => [a.primary_contact.split(",")[0].trim(), a.csm]).filter(p => has(text, p));
    add("H9", !email && !phone && !people.length, [email && `email ${email[0]}`, phone && `phone ${phone}`, people.length && `person ${people.join(", ")}`].filter(Boolean).join("; "));
    const internal = text.match(/\$\s?\d[\d,]*|\bARR\b|\brenew(al|s)?\b|\bCSM\b|\bS-\d{3}\b|\bREL-\d{3}\b|risk level/i);
    add("H10", !internal, `Internal data: "${internal && internal[0]}"`);
    const vendor = cfg.vendorDeny.find(v => !cfg.vendorAllow.includes(v) && has(text, v));
    add("H11", !vendor, `Third party not allowed: ${vendor}`);
    const tech = text.match(/https?:\/\/\S+|\bAPIs?\b|\bendpoints?\b|\btokens?\b|\bhostnames?\b|stack trace/i);
    add("H12", !tech, `Technical detail: "${tech && tech[0]}"`);
    const allowed = new Set(note.tickets);
    const outside = [...sources].filter(s => !allowed.has(s));
    add("H13", outside.length === 0, `Uses tickets outside this note: ${outside.join(", ")}`);
    add("H15", !INJECTION.test(text), "Text repeats an instruction found in a ticket");
    const road = text.match(mode === "pre-release" ? ROADMAP_PRE : ROADMAP);
    add("H17", !road, `Promise about future plans: "${road && road[0]}"`);
    const missing = note.tickets.filter(id => !sources.has(id));
    add("Q4", missing.length === 0, `Tickets not covered: ${missing.join(", ")}`);
    add("Q8", /^(Release Notes|Upcoming changes): /.test(text) && /\nSummary\n/.test(text) && /(Release Notes|Advance notice) \| Release /.test(text), "Template sections or footer missing");
    return res;
  }
  function reviewChecks(note, text, cfg, mode) {
    return codeChecks(note, text, new Set(note.tickets), cfg, mode).filter(r => ["H7", "H8", "H9", "H10", "H11", "H12", "H15", "H17"].includes(r.id));
  }
  // Remove customer names from an approved note before it is reused as a style example
  function anonymise(text) {
    let t = text;
    for (const a of D.accounts) for (const n of namesOf(a).sort((x, y) => y.length - x.length)) t = t.split(n).join("[Customer]");
    return t;
  }

  function editRate(a, b) {
    const x = a.toLowerCase().split(/\s+/).filter(Boolean), y = b.toLowerCase().split(/\s+/).filter(Boolean);
    if (!x.length && !y.length) return 0;
    const n = x.length, m = y.length;
    let prev = new Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      const cur = new Array(m + 1).fill(0);
      for (let j = 1; j <= m; j++) cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      prev = cur;
    }
    return 1 - prev[m] / Math.max(n, m);
  }
  function parseJSON(text) {
    const s = String(text || "").trim();
    try { return JSON.parse(s); } catch (e) {}
    const f = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (f) { try { return JSON.parse(f[1]); } catch (e) {} }
    const i = s.search(/[\[{]/), j = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    if (i >= 0 && j > i) return JSON.parse(s.slice(i, j + 1));
    throw new Error("No JSON in reply");
  }

  return { DEFAULT_CFG, withCfg, makeReader, classify, impact, actionItems, planNotes, noteTitle, batches, render, sourcesOf, mergeDrafts,
    codeChecks, reviewChecks, anonymise, editRate, parseJSON, split, addDays, namesOf, INJECTION, ROADMAP };
})();
if (typeof module !== "undefined") module.exports = CORE;
