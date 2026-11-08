/**
 * Marge de réussite d'une attaque (Livre de base p. 232 et 251) : chaque niveau de marge
 * donne Précision (+1 point de Blessures à la 1re touche) ou, pour une arme Multiple,
 * Étendue (+1 à la valeur X du trait Multiple). Par défaut, toute la marge va en Précision ;
 * l'attaquant déplace des points vers l'Étendue depuis le message de son jet.
 */
import { traitsEnCombat } from "./armes.mjs";
import { calculerBlessures, contenuMJCibles } from "./combat-blessures.mjs";

const nombre = v => Number(v) || 0;

/** Valeur X de base du trait Multiple de l'arme (0 sans Multiple) */
export function multipleDeBase(rollData) {
  const m = rollData.arme?.system?.traitsArme?.multiple;
  return m?.actif ? Math.max(1, nombre(m.valeur)) : 0;
}

/** Répartit la marge (Précision / Étendue) et met à jour les traits affichés */
export function repartirMarge(rollData) {
  const marge = Math.max(0, nombre(rollData.margin));
  const x = multipleDeBase(rollData);
  rollData.multipleBase = x;
  rollData.etendue = x ? Math.max(0, Math.min(marge, nombre(rollData.etendue))) : 0;
  rollData.precision = marge - rollData.etendue;
  rollData.multipleTotal = x + rollData.etendue;
  rollData.choixMarge = x > 0 && marge > 0;
  const traits = foundry.utils.deepClone(rollData.arme?.system?.traitsArme ?? {});
  if (x && traits.multiple) traits.multiple.valeur = rollData.multipleTotal;
  rollData.traitsCombat = traitsEnCombat(traits);
}

/** L'attaquant déplace 1 point de marge entre Précision et Étendue */
export async function changerEtendue(message, ecart) {
  if (!(message.isAuthor || game.user.isGM)) return ui.notifications.warn("Seul l'auteur de l'attaque peut répartir sa marge.");
  const rollData = message.getFlag("world", "rolldata");
  if (!rollData?.choixMarge) return;
  const avant = nombre(rollData.etendue);
  rollData.etendue = avant + ecart;
  repartirMarge(rollData);
  if (rollData.etendue === avant) return;
  if (rollData.cibles?.length) rollData.blessures = calculerBlessures(rollData, rollData.cibles);
  const content = await foundry.applications.handlebars.renderTemplate("systems/noc/templates/chat/chat-generic-result.hbs", rollData);
  await message.update({ content, "flags.world.rolldata": rollData });
  // message de la Loi (calcul des Blessures) mis à jour aussi
  const mj = game.messages.get(rollData.messageMJ);
  if (mj && (mj.isAuthor || game.user.isGM)) await mj.update({ content: contenuMJCibles(rollData) });
}
