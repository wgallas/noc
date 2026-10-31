/**
 * États de perdition (livre p. 252-255).
 *
 * - Blessures et Trauma : à 5, −1 à tous les Domaines ; à 8, en plus −1 à tous les Talents.
 *   Ces malus sont recalculés à chaque préparation de la fiche (plus d'effets actifs),
 *   donc ils disparaissent d'eux-mêmes quand la jauge redescend.
 * - L'état affiché (Blessé, Lourdement blessé, Choqué…) suit la valeur de la jauge.
 * - En montant (seulement), le passage d'un seuil déclenche une fois ses conséquences :
 *   séquelle (1 point devient permanent), traits de Traque ou de Noirceur, message au chat.
 * Concerne les personnages, et les rouages dont les jauges sont sur 10.
 */
import { NOC } from "./helpers/config.mjs";

const nombre = v => Number(v) || 0;
const SEUILS = [5, 8, 10];
const MALUS = { blessures: true, trauma: true };

/** Palier atteint (0, 5, 8 ou 10) pour une valeur de jauge */
export function palier(valeur) {
  const v = nombre(valeur);
  return v >= 10 ? 10 : v >= 8 ? 8 : v >= 5 ? 5 : 0;
}

function concerne(actor, p) {
  if (actor.type === "personnage") return true;
  return actor.type === "rouage" && nombre(p?.max) >= 10;
}

/** Malus et état affiché (appelé à la préparation de l'acteur) */
export function appliquerPerditions(actor) {
  const perditions = actor.system?.perditions;
  if (!perditions) return;
  actor.overrides ??= {};
  let malusDomaines = 0;
  let malusTalents = 0;
  for (const [cle, p] of Object.entries(perditions)) {
    if (!concerne(actor, p)) continue;
    const etape = palier(p.value);
    const def = NOC.effetsPerditions?.[cle]?.[etape];
    p.statut = { label: def?.label ?? "", description: def?.description ?? "" };
    if (!MALUS[cle]) continue;
    if (etape >= 5) malusDomaines += 1;
    if (etape >= 8) malusTalents += 1;
  }
  if (malusDomaines) {
    for (const [dom, d] of Object.entries(actor.system.domaines ?? {})) {
      d.value = nombre(d.value) - malusDomaines;
      foundry.utils.setProperty(actor.overrides, `system.domaines.${dom}.value`, d.value);
    }
  }
  if (malusTalents) {
    for (const [dom, liste] of Object.entries(actor.system.talents ?? {})) {
      for (const [tal, t] of Object.entries(liste ?? {})) {
        t.niveau = nombre(t.niveau) - malusTalents;
        foundry.utils.setProperty(actor.overrides, `system.talents.${dom}.${tal}.niveau`, t.niveau);
      }
    }
  }
}

/**
 * Folie au niveau 6 ou plus (livre de base p. 208) : avec au moins 3 points de Trauma,
 * +1 à tous les scores de Domaine. Calculé après tous les autres modificateurs
 * (le niveau de Folie retenu est le niveau effectif).
 */
export function appliquerFolieTranscendante(actor) {
  if (actor.type === "cabale") return;
  const s = actor.system;
  const folie = nombre(s?.talents?.ame?.folie?.niveau);
  const trauma = nombre(s?.perditions?.trauma?.value);
  s.folieTranscendante = folie >= 6 && trauma >= 3;
  if (!s.folieTranscendante) return;
  actor.overrides ??= {};
  for (const [dom, d] of Object.entries(s.domaines ?? {})) {
    d.value = nombre(d.value) + 1;
    foundry.utils.setProperty(actor.overrides, `system.domaines.${dom}.value`, d.value);
  }
}

/** Valeurs des jauges avant la mise à jour (pour repérer les seuils franchis) */
export function valeursAvant(actor) {
  return Object.fromEntries(Object.entries(actor._source.system?.perditions ?? {}).map(([k, p]) => [k, nombre(p.value)]));
}

/** Conséquences des seuils franchis en montant (personnages uniquement) */
export async function seuilsFranchis(actor, avant) {
  if (actor.type !== "personnage" || !avant) return;
  const lignes = [];
  const majMin = {};
  for (const [cle, p] of Object.entries(actor._source.system?.perditions ?? {})) {
    const ancien = nombre(avant[cle]);
    const nouveau = nombre(p.value);
    if (nouveau <= ancien) continue;
    for (const seuil of SEUILS) {
      if (!(ancien < seuil && nouveau >= seuil)) continue;
      const def = NOC.effetsPerditions?.[cle]?.[seuil];
      if (!def) continue;
      lignes.push(`<strong>${def.label ? def.label.charAt(0).toUpperCase() + def.label.slice(1) : ""}</strong> (${p.label ?? cle} ${seuil}) : ${def.description ?? ""}`);
      // séquelle : un point devient permanent (le minimum de la jauge monte de 1)
      if (def.sequelle) majMin[`system.perditions.${cle}.min`] = Math.min(nouveau, nombre(majMin[`system.perditions.${cle}.min`] ?? p.min) + 1);
      if (def.trait) {
        if (cle === "noirceur") actor.noirceurTraitDialog?.();
        if (cle === "noirceur" && seuil >= 10) lignes.push("La Loi peut lui appliquer un gabarit de corrompu (sadique, frénétique ou insidieux, p. 275) : compendium Archétypes, dossier « Gabarits de corrompus », à glisser sur la fiche.");
        if (cle === "traque") await ajouterTraitTraque(actor, seuil >= 10 ? "ennemi_public" : "criminel");
      }
    }
  }
  if (Object.keys(majMin).length) await actor.update(majMin);
  if (lignes.length) {
    const destinataires = game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id);
    await ChatMessage.create({
      content: `<div class="nocRoll"><h4>${actor.name}</h4>${lignes.map(l => `<p>${l}</p>`).join("")}</div>`,
      whisper: destinataires,
      speaker: ChatMessage.getSpeaker({ actor })
    });
  }
}

async function ajouterTraitTraque(actor, cle) {
  const trait = NOC.traitsPerditions?.traque?.[cle];
  if (!trait) return;
  const traits = [...(actor._source.system.traits ?? [])];
  if (traits.some(t => t.label === trait.label)) return;
  traits.push(trait);
  await actor.update({ "system.traits": traits });
}

/* -------------------------------------------- */
/*  Conversion : suppression des anciens effets  */
/* -------------------------------------------- */

export const VERSION_MIGRATION_PERDITIONS = 1;
const ANCIENS_NOMS = new Set(["blessé", "lourdement blessé", "agonisant", "choqué", "traumatisé", "fou"]);

function ancienEffetPerdition(effet) {
  const flagsWorld = effet.flags?.world ?? {};
  if (Object.keys(flagsWorld).some(k => k.startsWith("perdition-"))) return true;
  if (effet.flags?.noc?.perdition) return true;
  return ANCIENS_NOMS.has(String(effet.name ?? "").trim().toLowerCase());
}

/** Les anciens malus de perdition (effets actifs) sont retirés : le calcul les remplace */
export async function migrerPerditions() {
  if (!game.user.isGM) return;
  if ((game.settings.get("noc", "migrationPerditions") ?? 0) >= VERSION_MIGRATION_PERDITIONS) return;
  const acteurs = [...game.actors];
  for (const scene of game.scenes) for (const t of scene.tokens) if (!t.actorLink && t.actor) acteurs.push(t.actor);
  const erreurs = [];
  for (const actor of acteurs) {
    const ids = actor.effects.filter(ancienEffetPerdition).map(e => e.id);
    if (!ids.length) continue;
    try { await actor.deleteEmbeddedDocuments("ActiveEffect", ids); }
    catch (e) { erreurs.push(actor.name); console.error("NOC | perditions", actor.name, e); }
  }
  if (erreurs.length) {
    ui.notifications.error(`NOC : conversion des perditions incomplète pour ${erreurs.join(", ")}. Voir la console (F12).`, { permanent: true });
    return;
  }
  await game.settings.set("noc", "migrationPerditions", VERSION_MIGRATION_PERDITIONS);
}
