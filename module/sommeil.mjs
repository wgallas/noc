/**
 * Personnages « en sommeil » : ils restent dans le monde mais n'apparaissent plus
 * parmi les cibles du panneau du MJ.
 * - case « En réserve » sur la fiche (flags.noc.enReserve) ;
 * - ou rangement dans le dossier d'archives (réglage noc.dossierArchives) ou l'un de ses sous-dossiers.
 */

const normaliser = s => String(s ?? "").trim().toLowerCase();

/** Le dossier de l'acteur (ou l'un de ses parents) est-il le dossier d'archives ? */
export function dansArchives(actor) {
  const nom = normaliser(game.settings.get("noc", "dossierArchives"));
  if (!nom) return false;
  let dossier = actor?.folder;
  while (dossier) {
    if (normaliser(dossier.name) === nom) return true;
    dossier = dossier.folder;
  }
  return false;
}

/** Raison du sommeil : "reserve", "archives" ou null */
export function raisonSommeil(actor) {
  if (!actor || actor.type !== "personnage") return null;
  if (actor.getFlag?.("noc", "enReserve")) return "reserve";
  if (dansArchives(actor)) return "archives";
  return null;
}

/** Réveille un personnage : décoche la réserve et le sort du dossier d'archives */
export async function reveiller(actor) {
  if (actor.getFlag("noc", "enReserve")) await actor.unsetFlag("noc", "enReserve");
  if (dansArchives(actor)) await actor.update({ folder: null });
}
