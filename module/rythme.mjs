/**
 * Rythme de jeu, tenu par la Loi depuis le panneau du MJ (onglet Temps et progression) :
 * moment de calme, début de séance, début de scénario, fin de scénario (Passage).
 * Chaque étape s'applique à tous les Héros concernés et produit un seul message.
 */
import { avancerTemps, dateHorloge, QUARTS, reglerDate } from "./temps.mjs";
import { ajouterProgression, clorePassage, ouvrirPassage, passageOuvert } from "./progression.mjs";
import { raisonSommeil } from "./sommeil.mjs";
import { formulaire } from "./sheets/v2-outils.mjs";
import { rechargerCabales } from "./cabale.mjs";

const nombre = v => Number(v) || 0;
const echapper = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Héros actifs : personnages qui ne sont pas en sommeil */
export function herosActifs() {
  return game.actors.filter(a => a.type === "personnage" && !raisonSommeil(a));
}

/** Niveau d'un Atout de cabale (talents de la cabale) */
function atout(cabale, domaine, cle) {
  return nombre(cabale?.system.talents?.[domaine]?.[cle]?.niveau);
}

/** Fiel et Menace : passe par la fonction du panneau (plancher des cabales, compteur) */
async function fiel(cible) {
  const { fixerFiel, etatFiel } = await import("./panneau-mj.mjs");
  const valeur = typeof cible === "function" ? cible(etatFiel().gouttes) : cible;
  const { avant, apres } = await fixerFiel(valeur);
  return `Fiel : ${avant.gouttes} → ${apres.gouttes} gouttes (Menace ${avant.menace} → ${apres.menace})`;
}

/** Message de chat d'une étape : sections titrées */
async function annoncer(titre, sections) {
  const corps = sections.filter(s => s.lignes?.length).map(s =>
    `${s.titre ? `<p class="rythme-sous-titre">${s.titre}</p>` : ""}<ul>${s.lignes.map(l => `<li>${l}</li>`).join("")}</ul>`).join("");
  return ChatMessage.create({
    speaker: { alias: "La Loi" },
    content: `<div class="nocRoll message-rythme"><div class="rythme-bandeau flexrow"><span>${titre}</span><span class="rythme-date">${dateHorloge().texte}</span></div>${corps || "<p>Aucun changement.</p>"}</div>`
  });
}

/** Lignes d'un Héros, regroupées sous son nom */
function lignesHeros(heros, lignes) {
  return lignes.length ? [`<strong>${echapper(heros.name)}</strong> : ${lignes.join(" ; ")}`] : [];
}

/* -------------------------------------------- */
/*  Moment de calme                              */
/* -------------------------------------------- */

export async function momentDeCalme() {
  const heros = herosActifs();
  const cabales = game.actors.filter(a => a.type === "cabale");
  const optionsCabales = cabales.map(c => {
    const notes = [];
    const refuge = atout(c, "ame", "refuge");
    if (refuge > 0) notes.push(`Refuge ${refuge}`);
    if (refuge < 0) notes.push("Angoissante");
    if (atout(c, "social", "faussesIdentites") < 0) notes.push("Visible");
    return `<option value="${c.id}">Dans les locaux de ${echapper(c.name)}${notes.length ? ` (${notes.join(", ")})` : ""}</option>`;
  }).join("");
  const lignesHerosHtml = heros.map(h => `<div class="form-group ligne-heros-calme">
      <label><input type="checkbox" name="heros-${h.id}" checked> ${echapper(h.name)}</label>
      <span class="refuge-part" data-tooltip="part du Refuge (Espoir en plus)">+<input type="number" name="refuge-${h.id}" value="0" min="0" max="10"></span>
    </div>`).join("");
  const f = await formulaire("Moment de calme", `
    <p class="notes">Fiel −1 ; chaque Héros qui se repose : Blessures, Trauma, Traque et Noirceur −1, Espoir +1 + Extase, fatigue levée.</p>
    <div class="form-group"><label>Durée</label><select name="quarts">
      <option value="1" selected>1 quart (lieu familier et rassurant)</option>
      <option value="2">2 quarts (milieu inquiétant)</option>
      <option value="3">3 quarts (milieu hostile)</option>
      <option value="4">4 quarts</option></select></div>
    <div class="form-group"><label>Lieu</label><select name="cabale"><option value="">Ailleurs</option>${optionsCabales}</select></div>
    <p class="notes">Héros qui se reposent (et part du Refuge de la cabale, s'ils se reposent dans ses locaux : son niveau en points d'Espoir à se partager) :</p>
    ${lignesHerosHtml || "<p>Aucun Héros actif.</p>"}`, { valider: "Moment de calme", icone: "fa-solid fa-mug-hot" });
  if (!f) return;

  const cabale = game.actors.get(f.cabale) ?? null;
  const refuge = Math.max(0, atout(cabale, "ame", "refuge"));
  const sansEspoir = !!cabale && atout(cabale, "ame", "refuge") < 0;
  const sansTraque = !!cabale && atout(cabale, "social", "faussesIdentites") < 0;
  let resteRefuge = refuge;
  const sectionHeros = [];
  for (const h of heros) {
    if (!f[`heros-${h.id}`]) continue;
    const part = Math.min(resteRefuge, Math.max(0, nombre(f[`refuge-${h.id}`])));
    resteRefuge -= part;
    const lignes = await h.etapeDeJeu("calme", { message: false, bonusEspoir: part, sansEspoir, sansTraque });
    if (part) lignes.push(`dont +${part} Espoir du Refuge`);
    sectionHeros.push(...lignesHeros(h, lignes));
  }
  const generales = [await fiel(g => g - 1)];
  if (cabale) generales.push(`Repos dans les locaux de ${echapper(cabale.name)}${refuge ? ` (Refuge ${refuge}${resteRefuge ? `, ${resteRefuge} point${resteRefuge > 1 ? "s" : ""} non réparti${resteRefuge > 1 ? "s" : ""}` : ""})` : ""}`);
  const temps = await avancerTemps(nombre(f.quarts) || 1, { message: false });
  return annoncer("Moment de calme", [{ lignes: [...generales, ...temps] }, { titre: "Héros", lignes: sectionHeros }]);
}

/* -------------------------------------------- */
/*  Début de séance                              */
/* -------------------------------------------- */

export async function debutDeSeance() {
  const sectionHeros = [];
  for (const h of herosActifs()) sectionHeros.push(...lignesHeros(h, await h.etapeDeJeu("seance", { message: false })));
  const generales = [await fiel(g => g - 5)];
  return annoncer("Début de séance", [{ lignes: generales }, { titre: "Héros", lignes: sectionHeros }]);
}

/* -------------------------------------------- */
/*  Début de scénario                            */
/* -------------------------------------------- */

export async function debutDeScenario() {
  const generales = [];
  if (passageOuvert()) {
    const pertes = await clorePassage();
    generales.push("Passage clos", ...pertes);
  }
  generales.push(await fiel(0));
  generales.push(...await rechargerCabales());
  const sectionHeros = [];
  const actifs = herosActifs();
  for (const h of actifs) sectionHeros.push(...lignesHeros(h, await h.etapeDeJeu("scenario", { message: false })));
  // excès des Héros en sommeil levés aussi
  for (const h of game.actors.filter(a => a.type === "personnage" && !actifs.includes(a) && a.flags?.noc?.exces)) {
    await h.unsetFlag("noc", "exces");
    sectionHeros.push(`<strong>${echapper(h.name)}</strong> : excès levé`);
  }
  return annoncer("Début de scénario", [{ lignes: generales }, { titre: "Héros", lignes: sectionHeros }]);
}

/* -------------------------------------------- */
/*  Fin de scénario : progression et Passage     */
/* -------------------------------------------- */

export async function finDeScenario() {
  const heros = herosActifs();
  const lignes = heros.map(h => `<div class="form-group ligne-heros-progression">
      <label>${echapper(h.name)} <small>(${nombre(h.system.progression)} pt)</small></label>
      <input type="number" name="points-${h.id}" value="0" min="0" max="10">
    </div>`).join("");
  const f = await formulaire("Fin de scénario", `
    <p class="notes">Points de progression gagnés pendant le scénario (illuminations, récompenses), pour chaque Héros.</p>
    ${lignes || "<p>Aucun Héros actif.</p>"}
    <div class="form-group"><label>Motif</label><input type="text" name="motif" placeholder="titre du scénario, illumination…"></div>
    <p class="notes">Intermède jusqu'au prochain scénario : chaque mois complet donne 1 point de progression à chaque Héros (et une Régression tous les 6 mois vécus).</p>
    <div class="form-group"><label>Mois</label><input type="number" name="mois" value="0" min="0" max="60"></div>
    <div class="form-group"><label>Cycles en plus</label><input type="number" name="cycles" value="0" min="0" max="13"></div>
    <p class="notes">Le Passage s'ouvre ensuite : dès qu'un Héros a 3 points, son joueur peut les dépenser depuis sa fiche. Il se clôt au début du scénario suivant (2 points conservés au plus).</p>`,
    { valider: "Fin de scénario", icone: "fa-solid fa-flag-checkered" });
  if (!f) return;
  const motif = f.motif?.trim() ? `Fin de scénario : ${f.motif.trim()}` : "Fin de scénario";
  const gains = [];
  for (const h of heros) {
    const n = Math.max(0, Math.round(nombre(f[`points-${h.id}`])));
    if (!n) continue;
    await ajouterProgression(h, n, motif, "gain");
    gains.push(`<strong>${echapper(h.name)}</strong> : +${n} point${n > 1 ? "s" : ""}`);
  }
  const quarts = nombre(f.mois) * QUARTS.mois + nombre(f.cycles) * QUARTS.cycle;
  const temps = quarts ? await avancerTemps(quarts, { message: false, raison: "intermède" }) : [];
  await ouvrirPassage();
  const bilan = herosActifs().map(h => `<strong>${echapper(h.name)}</strong> : ${nombre(h.system.progression)} point${nombre(h.system.progression) > 1 ? "s" : ""}${nombre(h.system.regressionsDues) ? ` ; ${nombre(h.system.regressionsDues)} Régression(s) à appliquer` : ""}`);
  return annoncer("Fin de scénario — Passage ouvert", [
    { titre: "Progression", lignes: gains },
    { titre: "Intermède", lignes: temps },
    { titre: "Points disponibles", lignes: bilan }
  ]);
}

/** Clôture du Passage depuis le panneau */
export async function cloreLePassage() {
  const lignes = await clorePassage();
  return annoncer("Passage clos", [{ lignes: lignes.length ? lignes : ["Aucun point perdu."] }]);
}

/** Avance libre de l'horloge */
export async function avancerLibre() {
  const f = await formulaire("Faire passer le temps", `
    <div class="form-group"><label>Mois</label><input type="number" name="mois" value="0" min="0" max="60"></div>
    <div class="form-group"><label>Cycles</label><input type="number" name="cycles" value="0" min="0" max="100"></div>
    <div class="form-group"><label>Quarts</label><input type="number" name="quarts" value="0" min="0" max="100"></div>
    <div class="form-group"><label>Raison</label><input type="text" name="raison" placeholder="facultatif"></div>
    <div class="form-group"><label><input type="checkbox" name="sansEffet"> Régler la date seulement (sans progression, documents ni intermède)</label></div>`,
    { valider: "Avancer", icone: "fa-solid fa-forward" });
  if (!f) return;
  const q = nombre(f.mois) * QUARTS.mois + nombre(f.cycles) * QUARTS.cycle + nombre(f.quarts);
  if (q <= 0) return;
  if (f.sansEffet) return reglerDate(q);
  return avancerTemps(q, { raison: f.raison?.trim() ?? "" });
}
