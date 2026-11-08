/**
 * Horloge du Bloc : un seul compteur de temps, en quarts (Livre de base p. 57-58).
 * 1 cycle = 7 quarts ; 1 semaine = 4 cycles ; 1 mois = 14 cycles = 98 quarts.
 *
 * Tout ce qui dépend du temps qui passe en découle quand l'horloge avance :
 * - chaque cycle : documents du Bureau qui arrivent à expiration ;
 * - chaque semaine : rappel de la décontamination des cabales ;
 * - chaque mois : +1 point de progression et +1 mois vécu par Héros (Régression due
 *   tous les 6 mois vécus depuis sa création), intermède des cabales.
 */
import { cycleCourant, expirationsBureau } from "./documents-administratifs.mjs";
import { ajouterProgression } from "./progression.mjs";
import { raisonSommeil } from "./sommeil.mjs";

const nombre = v => Number(v) || 0;
export const QUARTS = { cycle: 7, semaine: 28, mois: 98 };

export function enregistrerReglageHorloge() {
  game.settings.register("noc", "horloge", { scope: "world", config: false, type: Number, default: -1 });
}

/** Quarts écoulés depuis le début de la campagne (calé sur le cycle du Bureau au premier usage) */
export function quartsEcoules() {
  let q = -1;
  try { q = nombre(game.settings.get("noc", "horloge")); } catch (e) { q = -1; }
  if (q < 0) q = cycleCourant() * QUARTS.cycle;
  return q;
}

/** Date lisible : mois, cycle du mois (1 à 14) et quart du cycle (1 à 7) */
export function dateHorloge(q = quartsEcoules()) {
  const mois = Math.floor(q / QUARTS.mois) + 1;
  const cycle = Math.floor((q % QUARTS.mois) / QUARTS.cycle) + 1;
  const quart = (q % QUARTS.cycle) + 1;
  return { mois, cycle, quart, cycleBureau: Math.floor(q / QUARTS.cycle), texte: `Mois ${mois} · cycle ${cycle} · quart ${quart}` };
}

/** Durée lisible en quarts (« 1 mois et 2 cycles ») */
export function texteDuree(q) {
  const parts = [];
  const mois = Math.floor(q / QUARTS.mois); q -= mois * QUARTS.mois;
  const cycles = Math.floor(q / QUARTS.cycle); q -= cycles * QUARTS.cycle;
  if (mois) parts.push(`${mois} mois`);
  if (cycles) parts.push(`${cycles} cycle${cycles > 1 ? "s" : ""}`);
  if (q) parts.push(`${q} quart${q > 1 ? "s" : ""}`);
  return parts.join(" et ") || "0 quart";
}

/** Héros qui vivent le temps qui passe : personnages hors dossier d'archives */
export function herosDuTemps() {
  return game.actors.filter(a => a.type === "personnage" && raisonSommeil(a) !== "archives");
}

/**
 * Fait avancer l'horloge de n quarts et applique ce qui en découle.
 * @returns {Promise<string[]>} lignes du récapitulatif
 */
export async function avancerTemps(n, { message = true, raison = "" } = {}) {
  if (!game.user.isGM) return [];
  n = Math.max(0, Math.round(nombre(n)));
  const q0 = quartsEcoules();
  const q1 = q0 + n;
  await game.settings.set("noc", "horloge", q1);
  const lignes = [`${texteDuree(n)} : ${dateHorloge(q0).texte} → <strong>${dateHorloge(q1).texte}</strong>`];

  // cycles : registre du Bureau
  const cycles = Math.floor(q1 / QUARTS.cycle) - Math.floor(q0 / QUARTS.cycle);
  if (cycles > 0) lignes.push(...await expirationsBureau(Math.floor(q1 / QUARTS.cycle)));

  // semaines : décontamination des cabales
  const semaines = Math.floor(q1 / QUARTS.semaine) - Math.floor(q0 / QUARTS.semaine);
  if (semaines > 0) {
    const contaminees = game.actors.filter(a => a.type === "cabale" && nombre(a.system.perditions?.noirceur?.value) > nombre(a.system.perditions?.noirceur?.min));
    if (contaminees.length) lignes.push(`${semaines} semaine${semaines > 1 ? "s" : ""} écoulée${semaines > 1 ? "s" : ""} : décontamination possible pour ${contaminees.map(c => c.name).join(", ")} (onglet Gestion).`);
  }

  // mois : progression et Régressions des Héros, intermède des cabales
  const mois = Math.floor(q1 / QUARTS.mois) - Math.floor(q0 / QUARTS.mois);
  if (mois > 0) {
    for (const heros of herosDuTemps()) {
      const vecus = nombre(heros._source.system.moisVecus);
      const regressions = Math.floor((vecus + mois) / 6) - Math.floor(vecus / 6);
      await heros.update({
        "system.moisVecus": vecus + mois,
        "system.regressionsDues": nombre(heros._source.system.regressionsDues) + regressions
      });
      await ajouterProgression(heros, mois, `Intermède : ${mois} mois`, "temps");
      lignes.push(`${heros.name} — +${mois} point${mois > 1 ? "s" : ""} de progression${regressions ? ` ; <strong>${regressions} Régression${regressions > 1 ? "s" : ""} à appliquer</strong>` : ""}`);
    }
    const { intermede } = await import("./cabale-gestion.mjs");
    const { membresCabale } = await import("./cabale.mjs");
    for (const cabale of game.actors.filter(a => a.type === "cabale" && membresCabale(a).length)) {
      await intermede(cabale, mois);
    }
  }

  if (message) {
    await ChatMessage.create({
      speaker: { alias: "La Loi" },
      content: `<div class="nocRoll message-temps"><h3>Le temps passe${raison ? ` : ${raison}` : ""}</h3><ul>${lignes.map(l => `<li>${l}</li>`).join("")}</ul></div>`
    });
  }
  rafraichirTemps();
  return lignes;
}

/** Redessine le panneau du MJ et les fiches de personnage ouvertes */
export function rafraichirTemps() {
  for (const app of foundry.applications.instances?.values?.() ?? []) {
    if (app.id === "noc-panneau-mj" || app.document?.type === "personnage") app.render();
  }
}
