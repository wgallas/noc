/**
 * Soins, apaisement et purification (livre p. 252-255).
 * Un jet de Soins enlève 1 Blessure par niveau obtenu, Apaisement 1 Trauma, Lumière 1 Noirceur.
 * Un personnage déjà aidé ne peut plus l'être, sauf par un meilleur niveau : il récupère alors
 * la différence. Toute nouvelle perte dans la jauge efface ce souvenir (flags.noc.soins).
 * La jauge ne descend pas sous son minimum (séquelles).
 */

export const SOINS = {
  soins: { perdition: "blessures", verbe: "soigne", label: "Blessures" },
  apaisement: { perdition: "trauma", verbe: "apaise", label: "Trauma" },
  lumiere: { perdition: "noirceur", verbe: "purifie", label: "Noirceur" }
};

const nombre = v => Number(v) || 0;

/** Données de soin d'un jet de talent (ou null si le talent ne soigne pas) */
export function soinDuJet(rollData) {
  if (rollData.mode !== "talent" || rollData.domaineId !== "vie") return null;
  const def = SOINS[rollData.talentId];
  if (!def) return null;
  return { talent: rollData.talentId, perdition: def.perdition, label: def.label, niveau: Math.max(0, nombre(rollData.niveauFinal)) };
}

/** Applique le soin (exécuté par le propriétaire de la cible ou par le MJ) */
export async function appliquerSoin(actor, talent, niveau, soignant) {
  const def = SOINS[talent];
  const p = actor?.system?.perditions?.[def?.perdition];
  if (!p) return ui.notifications.warn(`${actor?.name ?? "Cette cible"} n'a pas de jauge de ${def?.label ?? "perdition"}.`);
  const deja = nombre(actor.getFlag("noc", `soins.${def.perdition}`));
  const points = Math.max(0, nombre(niveau) - deja);
  const avant = nombre(actor._source.system.perditions[def.perdition].value);
  const min = nombre(p.min);
  const apres = Math.max(min, avant - points);
  let texte;
  if (points <= 0) {
    texte = `${actor.name} a déjà reçu un meilleur niveau (${deja}) : pas d'effet supplémentaire.`;
  } else {
    await actor.update({
      [`system.perditions.${def.perdition}.value`]: apres,
      [`flags.noc.soins.${def.perdition}`]: Math.max(deja, nombre(niveau))
    });
    texte = `${soignant} ${def.verbe} ${actor.name} : ${def.label} ${avant} → ${apres}`
      + (deja ? ` (niveau ${niveau}, déjà aidé au niveau ${deja})` : ` (niveau ${niveau})`)
      + (apres > avant - points ? ` — séquelle : minimum ${min}` : "");
  }
  await ChatMessage.create({ content: `<div class="nocRoll"><p>${texte}</p></div>`, speaker: ChatMessage.getSpeaker({ alias: soignant }) });
}

/** Demande de soin depuis le chat : directement si possible, sinon par le MJ */
export async function demanderSoin(actor, talent, niveau, soignant) {
  if (!actor) return;
  if (actor.isOwner) return appliquerSoin(actor, talent, niveau, soignant);
  if (!game.users.activeGM) return ui.notifications.warn("Aucun MJ connecté pour appliquer le soin.");
  game.socketManager.launchSocket("appliquerSoin", { actorUuid: actor.uuid, talent, niveau, soignant });
}
