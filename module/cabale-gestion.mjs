/**
 * Cabales : création, entretien et progression (règles avancées, p. 112-125).
 *
 * - Création : archétype (Atout majeur 2, deux mineurs 1, affinités de Domaines) ou création libre
 *   (Domaines à 2 + 2 points, majeur 2, deux mineurs 1), puis personnalisation +1 / −1.
 *   Apport d'un Héros : +1 à un Atout lié à un de ses Talents à 2 ou plus, contre une séquelle de Traque.
 * - Entretien : réparer (1 + Artisanat + Atelier par quart), lever les soupçons (1 + Façade par quart),
 *   ou 1 point de progression du Héros entre deux scénarios ; Noirceur −1 par semaine sans Noirceur ;
 *   Division −1 à −3 après une scène d'esprit de corps (la Loi).
 * - Progression : 3 points pour +1 Atout, +1 Domaine, +1 taille du Vécu ou une séquelle réparée ;
 *   1 point par mois entre deux aventures, une régression tous les 6 mois ; dons de progression des Héros.
 */
import { ATOUTS, JAUGES_CABALE, membresCabale, rechargerCabale } from "./cabale.mjs";

const nombre = v => Number(v) || 0;
const echapper = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DialogV2 = () => foundry.applications.api.DialogV2;

/** Archétypes de Cabale : Atout majeur, Atouts mineurs, Domaines d'affinité */
export const ARCHETYPES_CABALE = {
  loge: { label: "La loge", majeur: "reseau", mineurs: ["capital", "informateurs"], domaines: { statut: 4 } },
  centre: { label: "Le centre", majeur: "salleBlanche", mineurs: ["laboratoire", "observatoire"], domaines: { technique: 4 } },
  salon: { label: "Le salon", majeur: "societesEcrans", mineurs: ["informateurs", "standing"], domaines: { social: 3, statut: 3 } },
  culte: { label: "Le culte", majeur: "credo", mineurs: ["refuge", "fragmentsVerite"], domaines: { erudition: 3, ame: 3 } },
  // le livre nomme « Entrepôt » le second Atout mineur : c'est l'Atelier (entrepôt équipé)
  galerie: { label: "La galerie", majeur: "musee", mineurs: ["fragmentsVerite", "atelier"], domaines: { ame: 4 } },
  pieuvre: { label: "La Pieuvre", majeur: "fichier", mineurs: ["passages", "faussesIdentites"], domaines: { social: 3, statut: 3 } },
  base: { label: "La base", majeur: "fortifications", mineurs: ["armurerie", "niveauAcces"], domaines: { action: 4 } }
};

const COUT = 3;

/* -------------------------------------------- */
/*  Outils                                       */
/* -------------------------------------------- */

function cheminAtout(cle) {
  return `system.talents.${ATOUTS[cle].domaine}.${cle}.niveau`;
}

function niveauAtout(cabale, cle) {
  return nombre(foundry.utils.getProperty(cabale._source, cheminAtout(cle)));
}

function optionsAtouts({ vide = "", filtre = () => true, selection = "" } = {}) {
  const parDomaine = {};
  for (const [cle, def] of Object.entries(ATOUTS)) {
    if (!filtre(cle, def)) continue;
    (parDomaine[def.domaine] ??= []).push(`<option value="${cle}" ${cle === selection ? "selected" : ""}>${def.label}</option>`);
  }
  const libelles = game.model?.Actor?.cabale?.domaines ?? {};
  return (vide ? `<option value="">${vide}</option>` : "") + Object.entries(parDomaine)
    .map(([dom, opts]) => `<optgroup label="${libelles[dom]?.label ?? dom}">${opts.join("")}</optgroup>`).join("");
}

function optionsDomaines(cabale, vide = "") {
  return (vide ? `<option value="">${vide}</option>` : "") + Object.entries(cabale.system.domaines ?? {})
    .map(([cle, d]) => `<option value="${cle}">${d.label}</option>`).join("");
}

/** Membres dont l'utilisateur peut modifier la fiche */
function membresModifiables(cabale) {
  return membresCabale(cabale).filter(m => m.isOwner);
}

function optionsMembres(membres) {
  return membres.map(m => `<option value="${m.id}">${echapper(m.name)}</option>`).join("");
}

async function annoncer(cabale, titre, lignes) {
  const destinataires = game.users.filter(u => u.isGM || cabale.testUserPermission(u, "OWNER")).map(u => u.id);
  return ChatMessage.create({
    content: `<div class="nocRoll"><h4>${echapper(cabale.name)} : ${titre}</h4>${lignes.map(l => `<p>${l}</p>`).join("")}</div>`,
    whisper: destinataires,
    speaker: ChatMessage.getSpeaker({ actor: cabale })
  });
}

/** Fenêtre à formulaire : renvoie les champs du formulaire, ou null si annulée */
async function formulaire(titre, contenu, libelle = "Valider") {
  return DialogV2().wait({
    window: { title: titre },
    classes: ["nocDialog", "gestion-cabale-dialog"],
    position: { width: 460 },
    content: `<div class="gestion-cabale-form">${contenu}</div>`,
    buttons: [
      { action: "ok", label: libelle, icon: "fa-solid fa-check", default: true,
        callback: (event, bouton) => {
          const champs = {};
          for (const el of bouton.form.elements) {
            if (!el.name) continue;
            champs[el.name] = el.type === "checkbox" ? el.checked : el.value;
          }
          return champs;
        } },
      { action: "annuler", label: "Annuler", icon: "fa-solid fa-times", callback: () => null }
    ],
    rejectClose: false
  });
}

/** Modifie une jauge de la cabale (sans descendre sous le minimum) */
function nouvelleValeur(cabale, cle, ecart) {
  const p = cabale._source.system.perditions?.[cle] ?? {};
  return Math.max(nombre(p.min), Math.min(nombre(p.max) || 10, nombre(p.value) + ecart));
}

/* -------------------------------------------- */
/*  Création                                     */
/* -------------------------------------------- */

export async function assistantCreation(cabale) {
  const archetypes = Object.entries(ARCHETYPES_CABALE).map(([cle, a]) => {
    const doms = Object.entries(a.domaines).map(([d, v]) => `${cabale.system.domaines[d]?.label ?? d} ${v}`).join(", ");
    return `<option value="${cle}">${a.label} — ${ATOUTS[a.majeur].label} (2), ${a.mineurs.map(m => ATOUTS[m].label).join(", ")} (1) ; ${doms}</option>`;
  }).join("");
  const contenu = `
    <p class="notes">Remplace les Domaines et les Atouts actuels de la cabale. Les Domaines commencent à 2.</p>
    <div class="form-group"><label>Archétype</label><select name="archetype">${archetypes}<option value="libre">Création libre</option></select></div>
    <fieldset><legend>Création libre seulement</legend>
      <div class="form-group"><label>Atout majeur (2)</label><select name="majeur">${optionsAtouts({ vide: "—" })}</select></div>
      <div class="form-group"><label>Atout mineur (1)</label><select name="mineur1">${optionsAtouts({ vide: "—" })}</select></div>
      <div class="form-group"><label>Atout mineur (1)</label><select name="mineur2">${optionsAtouts({ vide: "—" })}</select></div>
      <div class="form-group"><label>Domaine +1</label><select name="domaine1">${optionsDomaines(cabale, "—")}</select></div>
      <div class="form-group"><label>Domaine +1</label><select name="domaine2">${optionsDomaines(cabale, "—")}</select></div>
    </fieldset>
    <fieldset><legend>Personnalisation (facultative)</legend>
      <div class="form-group"><label>Atout +1</label><select name="plus">${optionsAtouts({ vide: "aucun" })}</select></div>
      <div class="form-group"><label>Atout −1</label><select name="moins">${optionsAtouts({ vide: "aucun" })}</select></div>
      <p class="notes">À −1, l'Atout donne une faille.</p>
    </fieldset>`;
  const f = await formulaire(`Création : ${cabale.name}`, contenu, "Créer");
  if (!f) return;

  // Atouts et Domaines de départ
  let majeur, mineurs, domaines, archetype;
  if (f.archetype === "libre") {
    majeur = f.majeur; mineurs = [f.mineur1, f.mineur2];
    if (!majeur || !mineurs[0] || !mineurs[1]) return ui.notifications.warn("Création libre : choisissez l'Atout majeur et les deux Atouts mineurs.");
    if (new Set([majeur, ...mineurs]).size < 3) return ui.notifications.warn("Création libre : l'Atout majeur et les deux Atouts mineurs doivent être différents.");
    if (!f.domaine1 || !f.domaine2) return ui.notifications.warn("Création libre : répartissez les 2 points de Domaine.");
    domaines = {};
    for (const d of [f.domaine1, f.domaine2]) domaines[d] = (domaines[d] ?? 2) + 1;
    archetype = "Création libre";
  } else {
    const a = ARCHETYPES_CABALE[f.archetype];
    majeur = a.majeur; mineurs = a.mineurs; domaines = a.domaines; archetype = a.label;
  }
  if ((f.plus || f.moins) && (!f.plus || !f.moins || f.plus === f.moins)) {
    return ui.notifications.warn("Personnalisation : choisissez deux Atouts différents, l'un à +1 et l'autre à −1 (ou aucun).");
  }

  const dejaRemplie = Object.values(cabale._source.system.talents ?? {}).some(l => Object.values(l).some(t => nombre(t.niveau) !== 0));
  if (dejaRemplie) {
    const ok = await DialogV2().confirm({
      window: { title: "Remplacer le profil ?" },
      content: `<p>La cabale ${echapper(cabale.name)} a déjà des Atouts. Les remplacer par cette création ?</p>`
    });
    if (!ok) return;
  }

  const niveaux = Object.fromEntries(Object.keys(ATOUTS).map(cle => [cle, 0]));
  niveaux[majeur] = 2;
  for (const m of mineurs) niveaux[m] = 1;
  if (f.plus) { niveaux[f.plus] += 1; niveaux[f.moins] -= 1; }

  const maj = { "system.archetype": archetype, "system.apports": [] };
  for (const cle of Object.keys(cabale.system.domaines ?? {})) maj[`system.domaines.${cle}.value`] = domaines[cle] ?? 2;
  for (const [cle, n] of Object.entries(niveaux)) maj[cheminAtout(cle)] = n;
  await cabale.update(maj);
  await rechargerCabale(cabale);

  const lignes = [`<strong>${archetype}</strong>`,
    `Atouts : ${Object.entries(niveaux).filter(([, n]) => n !== 0).map(([c, n]) => `${ATOUTS[c].label} ${n}`).join(", ")}`,
    `Domaines : ${Object.entries(cabale.system.domaines).map(([, d]) => `${d.label} ${d.score}`).join(", ")}`];
  if (cabale.system.failles?.length) lignes.push(`Faille : ${cabale.system.failles.map(x => x.faille).join(" ; ")}`);
  if (cabale.system.atoutsPossedes > cabale.system.limiteAtouts) {
    lignes.push(`<strong>Attention</strong> : ${cabale.system.atoutsPossedes} Atouts différents pour une limite de ${cabale.system.limiteAtouts} (Standing).`);
  }
  await annoncer(cabale, "création", lignes);
}

/**
 * Apports des Héros enregistrés : [{ heros, atout, nom }].
 * Les anciens apports (simple identifiant de Héros) n'ont pas d'Atout connu.
 */
export function apportsCabale(cabale) {
  return (cabale.system.apports ?? []).map(x => {
    if (typeof x === "string") return { heros: x, atout: null, nom: game.actors.get(x)?.name ?? "Héros disparu" };
    return { heros: x?.heros ?? "", atout: x?.atout ?? null, nom: x?.nom || game.actors.get(x?.heros)?.name || "Héros disparu" };
  });
}

/** Atouts qu'un Héros peut soutenir : liés à un de ses Talents à 2 ou plus */
function atoutsSoutenables(heros) {
  return Object.entries(ATOUTS).filter(([, def]) => nombre(heros.system.talents?.[def.domaine]?.[def.talent]?.niveau) >= 2)
    .map(([cle, def]) => ({ cle, def, niveau: nombre(heros.system.talents[def.domaine][def.talent].niveau) }));
}

/** Un nouvel Atout (0 → 1) dépasserait-il la limite du Standing ? (ancien : Atout qui perd 1 au même moment) */
function depasseLimite(cabale, cle, ancien = null) {
  if (cle === "standing" || niveauAtout(cabale, cle) !== 0) return false;
  const libere = ancien && ancien !== "standing" && niveauAtout(cabale, ancien) === 1 ? 1 : 0;
  return cabale.system.atoutsPossedes - libere >= cabale.system.limiteAtouts;
}

/** Apport d'un Héros : +1 à un Atout lié à un de ses Talents à 2 ou plus, contre une séquelle de Traque */
export async function apportHeros(cabale) {
  const apports = apportsCabale(cabale);
  const deja = new Set(apports.map(x => x.heros));
  const choix = [];
  for (const m of membresModifiables(cabale)) {
    if (deja.has(m.id)) continue;
    for (const { cle, def, niveau } of atoutsSoutenables(m)) {
      choix.push(`<option value="${m.id}|${cle}">${echapper(m.name)} — ${def.label} (${def.talentLabel} ${niveau}, Atout ${niveauAtout(cabale, cle)})</option>`);
    }
  }
  if (!choix.length) {
    return ui.notifications.warn("Aucun apport possible : il faut un membre (dont vous avez la fiche) avec un Talent à 2 ou plus, qui n'a pas déjà fait d'apport.");
  }
  const f = await formulaire(`Apport d'un Héros : ${cabale.name}`, `
    <p class="notes">Chaque Héros peut apporter une fois +1 à un Atout lié à un de ses Talents à 2 ou plus. En contrepartie, il reçoit une séquelle de Traque.</p>
    <div class="form-group"><label>Apport</label><select name="apport">${choix.join("")}</select></div>`, "Apporter");
  if (!f?.apport) return;
  const [id, cle] = f.apport.split("|");
  const heros = game.actors.get(id);
  if (!heros) return;
  if (deja.has(id)) return ui.notifications.warn(`${heros.name} a déjà fait son apport à la cabale.`);
  const avant = niveauAtout(cabale, cle);
  if (depasseLimite(cabale, cle)) {
    return ui.notifications.warn(`La cabale possède déjà ${cabale.system.atoutsPossedes} Atouts différents, la limite de son Standing.`);
  }
  await cabale.update({ [cheminAtout(cle)]: avant + 1, "system.apports": [...apports, { heros: id, atout: cle, nom: heros.name }] });
  // séquelle de Traque : un point de Traque qui ne se récupère pas
  const t = heros._source.system.perditions?.traque ?? {};
  const max = nombre(t.max) || 10;
  await heros.update({
    "system.perditions.traque.value": Math.min(max, nombre(t.value) + 1),
    "system.perditions.traque.min": Math.min(max, nombre(t.min) + 1)
  });
  await annoncer(cabale, "apport d'un Héros", [
    `${echapper(heros.name)} apporte +1 en ${ATOUTS[cle].label} (${avant} → ${avant + 1}).`,
    `${echapper(heros.name)} reçoit une séquelle de Traque.`]);
}

/** Retire l'apport d'un Héros (mort, départ…) : l'Atout perd le niveau apporté */
export async function retirerApport(cabale, { index } = {}) {
  const apports = apportsCabale(cabale);
  const apport = apports[nombre(index)];
  if (!apport) return;
  const heros = game.actors.get(apport.heros);
  const optionsAtout = apport.atout ? "" : `
    <div class="form-group"><label>Atout qui perd le niveau</label><select name="atout"><option value="">aucun</option>${optionsAtouts({ filtre: cle => niveauAtout(cabale, cle) > -1 })}</select></div>
    <p class="notes">Cet ancien apport n'indique pas l'Atout concerné : choisissez-le.</p>`;
  const sequelle = heros && nombre(heros._source.system.perditions?.traque?.min) > 0 ? `
    <div class="form-group"><label><input type="checkbox" name="sequelle"> Retirer aussi la séquelle de Traque de ${echapper(heros.name)}</label></div>
    <p class="notes">Par défaut, la séquelle reste : elle représente les risques déjà pris pour la Cabale.</p>` : "";
  const f = await formulaire(`Retirer un apport : ${cabale.name}`, `
    <p>Retirer l'apport de <strong>${echapper(apport.nom)}</strong>${apport.atout ? ` (${ATOUTS[apport.atout].label} +1)` : ""} ?</p>
    ${apport.atout ? `<p class="notes">${ATOUTS[apport.atout].label} : ${niveauAtout(cabale, apport.atout)} → ${niveauAtout(cabale, apport.atout) - 1}.</p>` : ""}
    ${optionsAtout}${sequelle}`, "Retirer");
  if (!f) return;
  const cle = apport.atout ?? f.atout ?? "";
  const maj = { "system.apports": apports.filter((x, i) => i !== nombre(index)) };
  const lignes = [`L'apport de ${echapper(apport.nom)} est retiré.`];
  if (cle && ATOUTS[cle]) {
    const avant = niveauAtout(cabale, cle);
    maj[cheminAtout(cle)] = avant - 1;
    lignes.push(`${ATOUTS[cle].label} : ${avant} → ${avant - 1}.`);
  }
  await cabale.update(maj);
  if (f.sequelle && heros) {
    const t = heros._source.system.perditions.traque;
    await heros.update({
      "system.perditions.traque.min": Math.max(0, nombre(t.min) - 1),
      "system.perditions.traque.value": Math.max(0, nombre(t.value) - 1)
    });
    lignes.push(`${echapper(heros.name)} perd une séquelle de Traque.`);
  }
  if (cabale.system.failles?.some(x => x.cle === cle)) lignes.push(`Faille : ${ATOUTS[cle].faille}`);
  await annoncer(cabale, "apport retiré", lignes);
}

/** Change l'Atout soutenu par un Héros : le niveau passe de l'ancien Atout au nouveau (pas de nouvelle séquelle) */
export async function modifierApport(cabale, { index } = {}) {
  const apports = apportsCabale(cabale);
  const apport = apports[nombre(index)];
  const heros = game.actors.get(apport?.heros);
  if (!apport || !heros) return ui.notifications.warn("Ce Héros n'existe plus : retirez son apport.");
  const options = atoutsSoutenables(heros).filter(x => x.cle !== apport.atout)
    .map(({ cle, def, niveau }) => `<option value="${cle}">${def.label} (${def.talentLabel} ${niveau}, Atout ${niveauAtout(cabale, cle)})</option>`).join("");
  if (!options) return ui.notifications.warn(`${heros.name} n'a pas d'autre Talent à 2 ou plus.`);
  const f = await formulaire(`Modifier un apport : ${cabale.name}`, `
    <p>${echapper(heros.name)} soutient ${apport.atout ? `<strong>${ATOUTS[apport.atout].label}</strong>` : "un Atout non précisé"}. Le niveau apporté passe à un autre Atout lié à un de ses Talents à 2 ou plus, sans nouvelle séquelle.</p>
    <div class="form-group"><label>Nouvel Atout</label><select name="atout">${options}</select></div>
    ${apport.atout ? "" : `<div class="form-group"><label>Atout qui perd le niveau</label><select name="ancien"><option value="">aucun</option>${optionsAtouts({ filtre: cle => niveauAtout(cabale, cle) > -1 })}</select></div>`}`, "Modifier");
  if (!f?.atout) return;
  const ancien = apport.atout ?? f.ancien ?? "";
  const cle = f.atout;
  if (depasseLimite(cabale, cle, ancien)) {
    return ui.notifications.warn(`La cabale possède déjà ${cabale.system.atoutsPossedes} Atouts différents, la limite de son Standing.`);
  }
  const maj = {};
  const lignes = [];
  if (ancien && ATOUTS[ancien]) {
    const avant = niveauAtout(cabale, ancien);
    maj[cheminAtout(ancien)] = avant - 1;
    lignes.push(`${ATOUTS[ancien].label} : ${avant} → ${avant - 1}.`);
  }
  const avant = niveauAtout(cabale, cle);
  maj[cheminAtout(cle)] = avant + 1;
  lignes.push(`${ATOUTS[cle].label} : ${avant} → ${avant + 1}.`);
  maj["system.apports"] = apports.map((x, i) => i === nombre(index) ? { heros: x.heros, atout: cle, nom: heros.name } : x);
  await cabale.update(maj);
  await annoncer(cabale, "apport modifié", [`${echapper(heros.name)} soutient désormais ${ATOUTS[cle].label}.`, ...lignes]);
}


/* -------------------------------------------- */
/*  Entretien                                    */
/* -------------------------------------------- */

/** Réparer (Dégradation) ou lever les soupçons (Traque) */
export async function entretien(cabale, type) {
  const def = type === "reparer"
    ? { jauge: "blessures", titre: "Réparer la cabale", talent: ["technique", "artisanat", "Artisanat"], atout: "atelier", verbe: "répare" }
    : { jauge: "traque", titre: "Lever les soupçons", talent: ["statut", "façade", "Façade"], atout: null, verbe: "lève les soupçons" };
  const membres = membresModifiables(cabale);
  if (!membres.length) return ui.notifications.warn("Aucun membre de la cabale dont vous avez la fiche.");
  const p = cabale.system.perditions[def.jauge];
  if (nombre(p.value) <= nombre(p.min)) return ui.notifications.info(`${JAUGES_CABALE[def.jauge].label} : rien à retirer.`);
  // Atelier : son niveau s'ajoute, sauf si les Atouts sont inutilisables (Dégradation 5 ou plus)
  const atout = def.atout && !cabale.system.atoutsInutilisables ? Math.max(0, nombre(cabale.system.talents?.technique?.[def.atout]?.niveau)) : 0;
  const atelierBloque = def.atout && cabale.system.atoutsInutilisables && nombre(cabale.system.talents?.technique?.[def.atout]?.niveau) > 0;
  const f = await formulaire(`${def.titre} : ${cabale.name}`, `
    <p class="notes">${JAUGES_CABALE[def.jauge].label} actuelle : ${p.value}. Par quart : 1 + ${def.talent[2]} du Héros${atout ? ` + Atelier (${atout})` : ""}.${atelierBloque ? " L'Atelier ne sert pas tant que la Dégradation est à 5 ou plus." : ""}</p>
    <div class="form-group"><label>Héros</label><select name="heros">${optionsMembres(membres)}</select></div>
    <div class="form-group"><label>Quarts</label><input type="number" name="quarts" value="1" min="1" max="20"></div>
    <div class="form-group"><label><input type="checkbox" name="progression"> Entre deux scénarios : le Héros dépense 1 point de progression pour tout retirer</label></div>`);
  if (!f) return;
  const heros = game.actors.get(f.heros);
  if (!heros) return;
  const avant = nombre(p.value);
  let apres, detail;
  if (f.progression) {
    const prog = nombre(heros._source.system.progression);
    if (prog < 1) return ui.notifications.warn(`${heros.name} n'a pas de point de progression.`);
    await heros.update({ "system.progression": prog - 1 });
    apres = nouvelleValeur(cabale, def.jauge, -avant);
    detail = `1 point de progression de ${echapper(heros.name)}`;
  } else {
    const quarts = Math.max(1, nombre(f.quarts));
    const talent = nombre(heros.system.talents?.[def.talent[0]]?.[def.talent[1]]?.niveau);
    const parQuart = Math.max(0, 1 + talent + atout);
    apres = nouvelleValeur(cabale, def.jauge, -parQuart * quarts);
    detail = `${quarts} quart${quarts > 1 ? "s" : ""} × (1 + ${def.talent[2]} ${talent}${atout ? ` + Atelier ${atout}` : ""}) = ${parQuart * quarts}`;
  }
  if (apres !== avant) await cabale.update({ [`system.perditions.${def.jauge}.value`]: apres });
  const lignes = [`${echapper(heros.name)} ${def.verbe} : ${JAUGES_CABALE[def.jauge].label} ${avant} → ${apres} (${detail}).`];
  if (apres > 0 && apres === nombre(p.min)) lignes.push(`Il reste ${apres} point${apres > 1 ? "s" : ""} de séquelle.`);
  await annoncer(cabale, def.titre.toLowerCase(), lignes);
}

/** Noirceur : −1 par semaine sans nouveau point de Noirceur */
export async function semainesSansNoirceur(cabale) {
  const p = cabale.system.perditions.noirceur;
  if (nombre(p.value) <= nombre(p.min)) return ui.notifications.info("Noirceur : rien à retirer.");
  const f = await formulaire(`Décontaminer : ${cabale.name}`, `
    <p class="notes">La cabale perd 1 point de Noirceur par semaine pendant laquelle elle n'en a subi aucun.</p>
    <div class="form-group"><label>Semaines sans Noirceur</label><input type="number" name="semaines" value="1" min="1" max="10"></div>`);
  if (!f) return;
  const avant = nombre(p.value);
  const apres = nouvelleValeur(cabale, "noirceur", -Math.max(1, nombre(f.semaines)));
  if (apres !== avant) await cabale.update({ "system.perditions.noirceur.value": apres });
  await annoncer(cabale, "décontamination", [`Noirceur : ${avant} → ${apres}.`]);
}

/** Division : −1 à −3 à la fin d'une scène où les Héros ont fait preuve d'esprit de corps (la Loi) */
export async function espritDeCorps(cabale) {
  if (!game.user.isGM) return ui.notifications.warn("C'est à la Loi d'estimer l'esprit de corps.");
  const p = cabale.system.perditions.trauma;
  if (nombre(p.value) <= nombre(p.min)) return ui.notifications.info("Division : rien à retirer.");
  const f = await formulaire(`Esprit de corps : ${cabale.name}`, `
    <p class="notes">À la fin d'une scène où les Héros ont fait preuve d'esprit de corps, la Division diminue de 1 à 3 points.</p>
    <div class="form-group"><label>Points</label><select name="points"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></div>`);
  if (!f) return;
  const avant = nombre(p.value);
  const apres = nouvelleValeur(cabale, "trauma", -nombre(f.points));
  if (apres !== avant) await cabale.update({ "system.perditions.trauma.value": apres });
  await annoncer(cabale, "esprit de corps", [`Division : ${avant} → ${apres}.`]);
}

/* -------------------------------------------- */
/*  Progression                                  */
/* -------------------------------------------- */

/** Dépense de 3 points de progression */
export async function depenserProgression(cabale) {
  const s = cabale.system;
  const points = nombre(cabale._source.system.progression);
  if (points < COUT) return ui.notifications.warn(`Il faut ${COUT} points de progression (la cabale en a ${points}).`);
  const atouts = Object.entries(ATOUTS).map(([cle, def]) => {
    const n = niveauAtout(cabale, cle);
    return `<option value="atout:${cle}">${s.domaines[def.domaine]?.label ?? def.domaine} — ${def.label} (${n} → ${n + 1})</option>`;
  }).join("");
  const domaines = Object.entries(s.domaines).map(([cle, d]) => `<option value="domaine:${cle}">${d.label} (${d.score} → ${d.score + 1})</option>`).join("");
  const sequelles = Object.entries(JAUGES_CABALE).filter(([cle]) => nombre(cabale._source.system.perditions?.[cle]?.min) > 0)
    .map(([cle, j]) => `<option value="sequelle:${cle}">${j.label} (séquelles ${cabale._source.system.perditions[cle].min})</option>`).join("");
  const f = await formulaire(`Progression : ${cabale.name}`, `
    <p class="notes">${points} points de progression. Chaque achat coûte ${COUT} points.</p>
    <div class="form-group"><label>Achat</label><select name="achat">
      <optgroup label="Atout +1">${atouts}</optgroup>
      <optgroup label="Domaine +1">${domaines}</optgroup>
      <optgroup label="Autre"><option value="vecu">Réserve de Vécu +1 (${nombre(s.vecuAchats)} → ${nombre(s.vecuAchats) + 1} achat)</option>${sequelles ? sequelles : ""}</optgroup>
    </select></div>`, "Acheter");
  if (!f?.achat) return;
  const [type, cle] = f.achat.split(":");
  const maj = { "system.progression": points - COUT };
  let ligne;
  if (type === "atout") {
    const avant = niveauAtout(cabale, cle);
    if (avant === 0 && cle !== "standing" && s.atoutsPossedes >= s.limiteAtouts) {
      return ui.notifications.warn(`La cabale possède déjà ${s.atoutsPossedes} Atouts différents, la limite de son Standing (${s.limiteAtouts}). Augmentez d'abord le Standing.`);
    }
    maj[cheminAtout(cle)] = avant + 1;
    ligne = `${ATOUTS[cle].label} : ${avant} → ${avant + 1}`;
  } else if (type === "domaine") {
    const avant = nombre(cabale._source.system.domaines[cle].value);
    maj[`system.domaines.${cle}.value`] = avant + 1;
    ligne = `${s.domaines[cle].label} : ${avant} → ${avant + 1}`;
  } else if (type === "vecu") {
    maj["system.vecuAchats"] = nombre(cabale._source.system.vecuAchats) + 1;
    ligne = "Réserve de Vécu : +1";
  } else if (type === "sequelle") {
    const p = cabale._source.system.perditions[cle];
    maj[`system.perditions.${cle}.min`] = Math.max(0, nombre(p.min) - 1);
    maj[`system.perditions.${cle}.value`] = Math.max(0, nombre(p.value) - 1);
    ligne = `${JAUGES_CABALE[cle].label} : une séquelle réparée (${nombre(p.value)} → ${Math.max(0, nombre(p.value) - 1)})`;
  } else return;
  await cabale.update(maj);
  await annoncer(cabale, "progression", [`${ligne} (${COUT} points ; reste ${points - COUT}).`]);
}

/** Un Héros donne des points de progression à la cabale */
export async function donProgression(cabale) {
  const membres = membresModifiables(cabale).filter(m => nombre(m._source.system.progression) > 0);
  if (!membres.length) return ui.notifications.warn("Aucun membre (dont vous avez la fiche) n'a de point de progression.");
  const f = await formulaire(`Don de progression : ${cabale.name}`, `
    <p class="notes">Un Héros peut sacrifier ses propres points de progression pour faire progresser la cabale.</p>
    <div class="form-group"><label>Héros</label><select name="heros">${membres.map(m => `<option value="${m.id}">${echapper(m.name)} (${nombre(m._source.system.progression)})</option>`).join("")}</select></div>
    <div class="form-group"><label>Points</label><input type="number" name="points" value="1" min="1"></div>`, "Donner");
  if (!f) return;
  const heros = game.actors.get(f.heros);
  const dispo = nombre(heros?._source.system.progression);
  const n = Math.min(dispo, Math.max(1, nombre(f.points)));
  if (!heros || n < 1) return;
  await heros.update({ "system.progression": dispo - n });
  await cabale.update({ "system.progression": nombre(cabale._source.system.progression) + n });
  await annoncer(cabale, "don de progression", [`${echapper(heros.name)} donne ${n} point${n > 1 ? "s" : ""} de progression à la cabale.`]);
}

/** Intermède : 1 point de progression par mois, une régression tous les 6 mois */
export async function intermede(cabale) {
  const s = cabale._source.system;
  const f = await formulaire(`Intermède : ${cabale.name}`, `
    <p class="notes">La cabale gagne 1 point de progression par mois écoulé entre deux aventures et subit une régression tous les 6 mois (${nombre(s.moisEcoules)} mois écoulés jusqu'ici).</p>
    <div class="form-group"><label>Mois écoulés</label><input type="number" name="mois" value="1" min="1" max="60"></div>
    <div class="form-group"><label><input type="checkbox" name="entretien"> Locaux laissés sans entretien : +1 Dégradation par mois</label></div>`);
  if (!f) return;
  const mois = Math.max(1, nombre(f.mois));
  const avant = nombre(s.moisEcoules);
  const total = avant + mois;
  const nbRegressions = Math.floor(total / 6) - Math.floor(avant / 6);
  const lignes = [`${mois} mois : +${mois} point${mois > 1 ? "s" : ""} de progression.`];
  const maj = { "system.progression": nombre(s.progression) + mois, "system.moisEcoules": total };
  if (f.entretien) {
    const d = nouvelleValeur(cabale, "blessures", mois);
    maj["system.perditions.blessures.value"] = d;
    lignes.push(`Manque d'entretien : Dégradation ${nombre(s.perditions.blessures.value)} → ${d}.`);
  }
  // régressions : un Atout possédé à 1 ou plus perd 1 niveau
  const regressions = [...(s.regressions ?? [])];
  if (nbRegressions > 0) {
    const niveaux = Object.fromEntries(Object.keys(ATOUTS).map(cle => [cle, niveauAtout(cabale, cle)]));
    const choix = await choisirRegressions(cabale, nbRegressions, niveaux);
    if (!choix) return ui.notifications.warn("Intermède annulé : les régressions doivent être choisies.");
    for (const cle of choix) {
      lignes.push(`Régression : ${ATOUTS[cle].label} ${niveaux[cle]} → ${niveaux[cle] - 1}.`);
      niveaux[cle] -= 1;
      maj[cheminAtout(cle)] = niveaux[cle];
      regressions.push({ mois: total, atout: ATOUTS[cle].label });
    }
    maj["system.regressions"] = regressions;
  }
  await cabale.update(maj);
  await annoncer(cabale, "intermède", lignes);
}

async function choisirRegressions(cabale, nombreRegressions, niveaux) {
  const possedes = Object.entries(niveaux).filter(([, n]) => n >= 1);
  if (!possedes.length) return [];
  const options = possedes.map(([cle, n]) => `<option value="${cle}">${ATOUTS[cle].label} (${n})</option>`).join("");
  const selects = Array.from({ length: nombreRegressions }, (_, i) =>
    `<div class="form-group"><label>Régression ${i + 1}</label><select name="r${i}">${options}</select></div>`).join("");
  const f = await formulaire(`Régression : ${cabale.name}`, `
    <p class="notes">Usure, perte d'influence, entropie : les joueurs désignent ${nombreRegressions > 1 ? `${nombreRegressions} fois` : ""} un Atout possédé à 1 ou plus, qui perd 1 niveau.</p>${selects}`);
  if (!f) return null;
  const choix = Array.from({ length: nombreRegressions }, (_, i) => f[`r${i}`]).filter(Boolean);
  // un même Atout ne peut pas descendre sous 0 par régression
  const restes = { ...niveaux };
  for (const cle of choix) {
    if (restes[cle] < 1) { ui.notifications.warn(`${ATOUTS[cle].label} ne peut pas régresser davantage.`); return null; }
    restes[cle] -= 1;
  }
  return choix;
}
