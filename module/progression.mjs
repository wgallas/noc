/**
 * Progression des Héros (Livre de base p. 262-263).
 *
 * - Gains : 1 point par mois écoulé (horloge du Bloc), points attribués par la Loi en
 *   fin de scénario (illuminations, récompenses), différents pour chaque Héros.
 * - Passage : ouvert par la Loi en fin de scénario. Dès que le compteur atteint 3, le
 *   joueur dépense 3 points : Domaine ou Talent +1, Séquelle guérie, Vécu +1, trait
 *   Criminel levé (ou Ennemi public → Criminel) contre un niveau de Statut.
 *   À la clôture du Passage, chaque Héros garde au plus 2 points.
 * - Régressions : une par tranche de 6 mois vécus depuis la création ; le joueur retire
 *   1 niveau à un Talent à 1 ou plus.
 * - Historique : chaque gain, dépense, perte et Régression est consigné sur la fiche
 *   (system.historiqueProgression).
 */
import { formulaire } from "./sheets/v2-outils.mjs";

const nombre = v => Number(v) || 0;
const echapper = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const COUT_PASSAGE = 3;
export const RESTE_MAX = 2;

export function enregistrerReglagePassage() {
  game.settings.register("noc", "passage", {
    scope: "world", config: false, type: Boolean, default: false,
    onChange: () => {
      for (const app of foundry.applications.instances?.values?.() ?? []) {
        if (app.id === "noc-panneau-mj" || app.document?.type === "personnage") app.render();
      }
    }
  });
}

export function passageOuvert() {
  try { return !!game.settings.get("noc", "passage"); } catch (e) { return false; }
}

/* -------------------------------------------- */
/*  Historique                                   */
/* -------------------------------------------- */

async function dateCourante() {
  const { dateHorloge } = await import("./temps.mjs");
  return dateHorloge().texte;
}

/** Ajoute des entrées à l'historique et met à jour le compteur dans la même opération */
async function consigner(actor, entrees, maj = {}) {
  const horloge = await dateCourante();
  const historique = [...(actor._source.system.historiqueProgression ?? [])];
  for (const e of entrees) historique.push({ date: Date.now(), horloge, ...e });
  return actor.update({ ...maj, "system.historiqueProgression": historique });
}

/** Gain (ou retrait) de points de progression, consigné dans l'historique */
export async function ajouterProgression(actor, points, detail, type = "gain") {
  points = Math.round(nombre(points));
  if (!points) return;
  const solde = Math.max(0, nombre(actor._source.system.progression) + points);
  return consigner(actor, [{ type, points, solde, detail }], { "system.progression": solde });
}

/** Correction manuelle du compteur depuis la fiche */
export async function corrigerProgression(actor, ecart) {
  const avant = nombre(actor._source.system.progression);
  const solde = Math.max(0, avant + ecart);
  if (solde === avant) return;
  return consigner(actor, [{ type: "correction", points: solde - avant, solde, detail: `Correction manuelle (${game.user.name})` }], { "system.progression": solde });
}

/* -------------------------------------------- */
/*  Passage                                      */
/* -------------------------------------------- */

export async function ouvrirPassage() {
  if (!game.user.isGM) return;
  await game.settings.set("noc", "passage", true);
}

/** Clôture du Passage : au-delà de 2 points, le reste est perdu */
export async function clorePassage() {
  if (!game.user.isGM) return [];
  const lignes = [];
  for (const heros of game.actors.filter(a => a.type === "personnage")) {
    const pts = nombre(heros._source.system.progression);
    if (pts <= RESTE_MAX) continue;
    await consigner(heros, [{ type: "perte", points: RESTE_MAX - pts, solde: RESTE_MAX, detail: "Fin du Passage : 2 points conservés au plus" }],
      { "system.progression": RESTE_MAX });
    lignes.push(`${heros.name} — ${pts} → ${RESTE_MAX} points (fin du Passage)`);
  }
  await game.settings.set("noc", "passage", false);
  return lignes;
}

/* -------------------------------------------- */
/*  Dépense                                      */
/* -------------------------------------------- */

const LIBELLES_PERDITIONS = { blessures: "Blessures", trauma: "Trauma", noirceur: "Noirceur", traque: "Traque" };

/** Choix offerts par un Passage pour ce Héros */
function choixDepense(actor) {
  const s = actor.system, src = actor._source.system;
  const options = [];
  const domaines = Object.entries(s.domaines ?? {}).map(([cle, d]) =>
    `<option value="domaine:${cle}">${echapper(d.label)} (${nombre(d.value)} → ${nombre(d.value) + 1})</option>`).join("");
  options.push(`<optgroup label="Domaine +1">${domaines}</optgroup>`);
  for (const [dom, liste] of Object.entries(s.talents ?? {})) {
    const opts = Object.entries(liste).map(([tal, t]) =>
      `<option value="talent:${dom}.${tal}">${echapper(t.label)} (${nombre(t.niveau)} → ${nombre(t.niveau) + 1})</option>`).join("");
    options.push(`<optgroup label="Talent +1 — ${echapper(s.domaines?.[dom]?.label ?? dom)}">${opts}</optgroup>`);
  }
  const sequelles = Object.entries(src.perditions ?? {}).filter(([, p]) => nombre(p.min) > 0)
    .map(([cle, p]) => `<option value="sequelle:${cle}">${LIBELLES_PERDITIONS[cle] ?? cle} (séquelles ${nombre(p.min)} → ${nombre(p.min) - 1})</option>`).join("");
  if (sequelles) options.push(`<optgroup label="Guérir une Séquelle">${sequelles}</optgroup>`);
  const vecu = nombre(src.reserves?.vecu?.max);
  options.push(`<optgroup label="Réserve"><option value="vecu">Vécu : réserve ${vecu} → ${vecu + 1}</option></optgroup>`);
  const traits = (src.traits ?? []).map(t => t?.label);
  if (traits.includes("ennemi public")) options.push(`<optgroup label="Traits"><option value="criminel">Ennemi public → Criminel (sacrifie 1 niveau de Statut)</option></optgroup>`);
  else if (traits.includes("criminel")) options.push(`<optgroup label="Traits"><option value="criminel">Se débarrasser du trait Criminel (sacrifie 1 niveau de Statut)</option></optgroup>`);
  return options.join("");
}

function optionsStatut(actor) {
  return Object.entries(actor.system.talents?.statut ?? {}).filter(([, t]) => nombre(t.niveau) > -1)
    .map(([tal, t]) => `<option value="${tal}">${echapper(t.label)} (${nombre(t.niveau)})</option>`).join("");
}

/** Dépense de 3 points de progression (Passage ouvert, compteur à 3 ou plus) */
export async function depenserProgressionHeros(actor) {
  if (!passageOuvert()) return ui.notifications.warn("La progression se dépense lors d'un Passage, en fin de scénario.");
  const dispo = nombre(actor._source.system.progression);
  if (dispo < COUT_PASSAGE) return ui.notifications.warn(`Il faut ${COUT_PASSAGE} points de progression.`);
  const statut = optionsStatut(actor);
  const f = await formulaire(`Passage : ${actor.name}`, `
    <p class="notes">${dispo} points de progression. Chaque amélioration coûte ${COUT_PASSAGE} points ; à la fin du Passage, ${RESTE_MAX} points au plus sont conservés.</p>
    <div class="form-group"><label>Amélioration</label><select name="choix">${choixDepense(actor)}</select></div>
    <div class="form-group"><label>Statut sacrifié <em>(traits Criminel / Ennemi public)</em></label><select name="statut">${statut || `<option value="">—</option>`}</select></div>
    <div class="form-group"><label>Explication</label><input type="text" name="explication" placeholder="facultatif (obligatoire pour une Séquelle)"></div>`,
    { valider: `Dépenser ${COUT_PASSAGE} points`, icone: "fa-solid fa-arrow-up" });
  if (!f?.choix) return;
  const src = actor._source.system;
  const maj = {};
  let detail = "";
  const [genre, cle] = f.choix.split(":");
  if (genre === "domaine") {
    const base = nombre(src.domaines?.[cle]?.value);
    maj[`system.domaines.${cle}.value`] = base + 1;
    const eff = nombre(actor.system.domaines?.[cle]?.value);
    detail = `Domaine ${actor.system.domaines?.[cle]?.label ?? cle} : ${eff} → ${eff + 1}`;
  } else if (genre === "talent") {
    const [dom, tal] = cle.split(".");
    const base = nombre(src.talents?.[dom]?.[tal]?.niveau);
    maj[`system.talents.${dom}.${tal}.niveau`] = base + 1;
    const eff = nombre(actor.system.talents?.[dom]?.[tal]?.niveau);
    detail = `Talent ${actor.system.talents?.[dom]?.[tal]?.label ?? tal} : ${eff} → ${eff + 1}`;
  } else if (genre === "sequelle") {
    const min = nombre(src.perditions?.[cle]?.min);
    maj[`system.perditions.${cle}.min`] = Math.max(0, min - 1);
    detail = `Séquelle de ${LIBELLES_PERDITIONS[cle] ?? cle} guérie (${min} → ${min - 1})`;
  } else if (genre === "vecu") {
    const max = nombre(src.reserves?.vecu?.max);
    maj["system.reserves.vecu.max"] = max + 1;
    detail = `Réserve de Vécu : ${max} → ${max + 1}`;
  } else if (genre === "criminel") {
    if (!f.statut) return ui.notifications.warn("Tous les Talents de Statut sont déjà à −1 : impossible.");
    const traits = [...(src.traits ?? [])];
    const i = traits.findIndex(t => t?.label === "ennemi public");
    let texte;
    if (i >= 0) {
      const { NOC } = await import("./helpers/config.mjs");
      traits.splice(i, 1, NOC.traitsPerditions.traque.criminel);
      texte = "Trait Ennemi public devenu Criminel";
    } else {
      const j = traits.findIndex(t => t?.label === "criminel");
      if (j >= 0) traits.splice(j, 1);
      texte = "Trait Criminel levé";
    }
    maj["system.traits"] = traits;
    const base = nombre(src.talents?.statut?.[f.statut]?.niveau);
    maj[`system.talents.statut.${f.statut}.niveau`] = base - 1;
    detail = `${texte} ; ${actor.system.talents?.statut?.[f.statut]?.label ?? f.statut} −1`;
  } else return;
  if (f.explication?.trim()) detail += ` — ${f.explication.trim()}`;
  const solde = dispo - COUT_PASSAGE;
  maj["system.progression"] = solde;
  await consigner(actor, [{ type: "depense", points: -COUT_PASSAGE, solde, detail }], maj);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="nocRoll message-progression"><h3>Passage : ${echapper(actor.name)} progresse</h3><p>${echapper(detail)}</p><p class="note-combat">−${COUT_PASSAGE} points de progression (reste ${solde})</p></div>`
  });
}

/* -------------------------------------------- */
/*  Régressions                                  */
/* -------------------------------------------- */

/** Applique une Régression due : un Talent à 1 ou plus perd 1 niveau */
export async function appliquerRegression(actor) {
  const dues = nombre(actor._source.system.regressionsDues);
  if (dues < 1) return;
  const options = [];
  for (const [dom, liste] of Object.entries(actor.system.talents ?? {})) {
    for (const [tal, t] of Object.entries(liste)) {
      if (nombre(t.niveau) >= 1) options.push(`<option value="${dom}.${tal}">${echapper(t.label)} (${nombre(t.niveau)} → ${nombre(t.niveau) - 1})</option>`);
    }
  }
  if (!options.length) {
    await consigner(actor, [{ type: "regression", points: 0, solde: nombre(actor._source.system.progression), detail: "Régression sans effet : aucun Talent à 1 ou plus" }],
      { "system.regressionsDues": dues - 1 });
    return;
  }
  const f = await formulaire(`Régression : ${actor.name}`, `
    <p class="notes">Six mois se sont écoulés : sous la pression des événements, le Héros se désengage d'un pan de sa vie. Retirez 1 niveau à l'un de ses Talents à 1 ou plus.${dues > 1 ? ` (${dues} Régressions à appliquer.)` : ""}</p>
    <div class="form-group"><label>Talent</label><select name="talent">${options.join("")}</select></div>`,
    { valider: "Appliquer", icone: "fa-solid fa-arrow-down" });
  if (!f?.talent) return;
  const [dom, tal] = f.talent.split(".");
  const base = nombre(actor._source.system.talents?.[dom]?.[tal]?.niveau);
  const eff = nombre(actor.system.talents?.[dom]?.[tal]?.niveau);
  const detail = `Régression : ${actor.system.talents?.[dom]?.[tal]?.label ?? tal} ${eff} → ${eff - 1}`;
  await consigner(actor, [{ type: "regression", points: 0, solde: nombre(actor._source.system.progression), detail }],
    { [`system.talents.${dom}.${tal}.niveau`]: base - 1, "system.regressionsDues": dues - 1 });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="nocRoll message-progression"><h3>${echapper(actor.name)} : Régression</h3><p>${echapper(detail)}</p></div>`
  });
}

/* -------------------------------------------- */
/*  Historique                                   */
/* -------------------------------------------- */

const TYPES = { gain: "Gain", temps: "Intermède", depense: "Dépense", perte: "Perte", regression: "Régression", correction: "Correction", don: "Don" };

/** Fenêtre de l'historique de progression d'un Héros */
export async function ouvrirHistorique(actor) {
  const historique = [...(actor.system.historiqueProgression ?? [])].reverse();
  const lignes = historique.map(e => `<tr class="type-${e.type}">
      <td>${new Date(e.date).toLocaleDateString("fr-FR")}<br><small>${echapper(e.horloge ?? "")}</small></td>
      <td>${TYPES[e.type] ?? e.type}</td>
      <td>${echapper(e.detail)}</td>
      <td class="points">${e.points > 0 ? "+" : ""}${e.points || ""}</td>
      <td class="points">${nombre(e.solde)}</td></tr>`).join("");
  const contenu = `<div class="historique-progression">
    <p class="notes">${nombre(actor.system.progression)} point(s) de progression · ${nombre(actor.system.moisVecus)} mois vécus · ${nombre(actor.system.regressionsDues)} Régression(s) à appliquer</p>
    ${lignes ? `<table><tr><th>Date</th><th>Type</th><th>Détail</th><th>Points</th><th>Solde</th></tr>${lignes}</table>` : "<p>Aucune entrée pour l'instant.</p>"}
  </div>`;
  return foundry.applications.api.DialogV2.prompt({
    window: { title: `Progression : ${actor.name}` },
    classes: ["nocDialog", "fenetre-historique"],
    position: { width: 620 },
    content: contenu,
    ok: { label: "Fermer", icon: "fa-solid fa-check" },
    rejectClose: false
  });
}
