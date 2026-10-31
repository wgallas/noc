/**
 * Flux des Seuils (livre de base p. 205) : effet d'environnement réglé par le MJ.
 *
 * Près d'un Seuil, un personnage qui provoque le destin :
 * - doit lancer au moins autant de dés de destin que le Flux ;
 * - peut lancer jusqu'à Domaine + Flux dés de domaine.
 * Le Flux baisse de 1 tous les 10 m depuis les limites du Seuil et selon le temps
 * écoulé depuis sa dernière ouverture.
 *
 * Réglage du monde noc.flux : { lieu, tarissement, eloignement }.
 */

export const LIEUX_FLUX = {
  aucun: { label: "Aucun Seuil", flux: 0 },
  fragment: { label: "Fragment", flux: 1 },
  souille: { label: "Site souillé de Fiel", flux: 1 },
  hranice: { label: "Corridor de Hranice", flux: 1 },
  passage: { label: "Passage", flux: 2 },
  axe: { label: "Intérieur d'un Axe", flux: 2 },
  alpha: { label: "Anomalie Alpha", flux: 2 },
  heptapode: { label: "Abords d'un heptapode (MOX)", flux: 2 },
  echo: { label: "Écho", flux: 3 },
  tesseract: { label: "Tesseract", flux: 3 },
  limite: { label: "La Limite (segment moravien)", flux: 3 },
  mare: { label: "Mare Tenebrarum", flux: 4 }
};

export const TARISSEMENT_FLUX = {
  ouvert: { label: "Seuil encore ouvert", mod: 0 },
  quarts: { label: "Fermé depuis quelques quarts", mod: -1 },
  cycles: { label: "Fermé depuis quelques cycles", mod: -2 },
  annees: { label: "Fermé depuis quelques années", mod: -3 },
  conjonction: { label: "Ouvert en Conjonction favorable", mod: 1 }
};

export const ELOIGNEMENT_FLUX = {
  0: "Dans les limites du Seuil",
  1: "À 10 m ou plus",
  2: "À 20 m ou plus",
  3: "À 30 m ou plus",
  4: "À 40 m ou plus"
};

export const FLUX_DEFAUT = { lieu: "aucun", tarissement: "ouvert", eloignement: 0 };

export function enregistrerReglageFlux() {
  game.settings.register("noc", "flux", {
    scope: "world",
    config: false,
    type: Object,
    default: { ...FLUX_DEFAUT },
    onChange: () => { if (ui.nocPanneauMJ?.rendered) ui.nocPanneauMJ.render(); }
  });
}

/** Réglage lu et complété */
export function reglageFlux() {
  let r = {};
  try { r = game.settings.get("noc", "flux") ?? {}; } catch (e) { r = {}; }
  return {
    lieu: LIEUX_FLUX[r.lieu] ? r.lieu : FLUX_DEFAUT.lieu,
    tarissement: TARISSEMENT_FLUX[r.tarissement] ? r.tarissement : FLUX_DEFAUT.tarissement,
    eloignement: Math.max(0, Math.min(4, Number(r.eloignement) || 0))
  };
}

/** Flux effectif (0 = pas d'effet) */
export function valeurFlux(r = reglageFlux()) {
  if (r.lieu === "aucun") return 0;
  return Math.max(0, LIEUX_FLUX[r.lieu].flux + TARISSEMENT_FLUX[r.tarissement].mod - r.eloignement);
}

/** Description courte du réglage en cours */
export function descriptionFlux(r = reglageFlux()) {
  if (r.lieu === "aucun") return "Aucun Seuil";
  const parties = [LIEUX_FLUX[r.lieu].label, TARISSEMENT_FLUX[r.tarissement].label.toLowerCase()];
  if (r.eloignement) parties.push(ELOIGNEMENT_FLUX[r.eloignement].toLowerCase());
  return parties.join(", ");
}

/** Données pour le panneau du MJ */
export function contexteFlux() {
  const r = reglageFlux();
  return {
    valeur: valeurFlux(r),
    description: descriptionFlux(r),
    lieux: Object.entries(LIEUX_FLUX).map(([cle, l]) => ({ cle, label: l.flux ? `${l.label} (${l.flux})` : l.label, choisi: cle === r.lieu })),
    tarissements: Object.entries(TARISSEMENT_FLUX).map(([cle, t]) => ({ cle, label: `${t.label} (${t.mod > 0 ? "+" : ""}${t.mod})`, choisi: cle === r.tarissement })),
    eloignements: Object.entries(ELOIGNEMENT_FLUX).map(([cle, label]) => ({ cle, label: Number(cle) ? `${label} (−${cle})` : label, choisi: Number(cle) === r.eloignement })),
    inactif: r.lieu === "aucun"
  };
}

/** Modifie le réglage (MJ) */
export async function modifierFlux(changements) {
  const r = { ...reglageFlux(), ...changements };
  return game.settings.set("noc", "flux", r);
}

/** Données du Flux pour un jet (fenêtre de jet) */
export function fluxPourJet() {
  const flux = valeurFlux();
  return { flux, fluxActif: flux > 0, fluxDescription: descriptionFlux() };
}

/**
 * Au lancer : si le personnage provoque le destin près d'un Seuil avec moins de dés
 * que le Flux, des dés de domaine sont ajoutés pour atteindre ce minimum.
 */
export function imposerMinimumFlux(rollData) {
  rollData.fluxImpose = 0;
  if (!rollData.fluxActif || !(rollData.flux > 0)) return;
  const total = (Number(rollData.nbDesDomaine) || 0) + (Number(rollData.nbDesCabale) || 0)
    + ((rollData.useEspoir || rollData.useEspoirCabale) ? 3 : 0);
  if (total > 0 && total < rollData.flux) {
    const ajout = rollData.flux - total;
    rollData.nbDesDomaine = (Number(rollData.nbDesDomaine) || 0) + ajout;
    rollData.fluxImpose = ajout;
  }
}
