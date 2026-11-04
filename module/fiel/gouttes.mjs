/**
 * Gouttes de Fiel produites par les dés de destin (livre de base p. 231).
 *
 * - Héros ou Rouage allié : chaque 1 ajoute une goutte de Fiel.
 * - Rouage hostile ou opposé aux Héros : chaque 1 retire une goutte, même si la Menace
 *   baisse en passant sous une tranche de 5 (décision du MJ). À 0 goutte (ou au plancher
 *   dû à la Noirceur d'une cabale), aucun effet : la Loi gère elle-même la Singularité.
 */
import { etatFiel, fixerFiel } from "../panneau-mj.mjs";
import { plancherFiel } from "../cabale.mjs";

/** Rouage hostile : acteur sans joueur propriétaire, dont le jeton est hostile */
export function estRouageHostile(actor) {
  if (!actor || actor.type === "cabale" || actor.hasPlayerOwner) return false;
  const jeton = actor.token ?? actor.getActiveTokens?.()[0]?.document ?? actor.prototypeToken;
  return jeton?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
}

/**
 * Applique les 1 obtenus sur des dés de destin.
 * @param {boolean} hostile  le lanceur est un Rouage hostile
 * @param {number} nb        nombre de 1
 * @param {string} nom       nom du lanceur (pour le message)
 */
export function fielDesDes(hostile, nb, nom = "") {
  nb = Number(nb) || 0;
  if (nb <= 0) return;
  if (!hostile) {
    game.socketManager.launchSocket("gouttePlus", { qt: nb });
    ui.compteur.gouttePlus(nb);
    return;
  }
  if (game.user.isGM) return retirerGouttesHostiles(nb, nom);
  game.socketManager.launchSocket("goutteHostile", { qt: nb, nom });
}

/** (MJ) Un Rouage hostile a obtenu nb fois 1 : le Fiel baisse d'autant (jusqu'à 0 ou au plancher) */
export async function retirerGouttesHostiles(nb, nom = "") {
  if (!game.users.activeGM?.isSelf) return;
  const { gouttes, menace } = etatFiel();
  const cible = Math.max(plancherFiel(), gouttes - (Number(nb) || 0));
  if (cible === gouttes) return;
  const { apres } = await fixerFiel(cible);
  const lignes = [`Fiel : ${gouttes} → ${apres.gouttes} goutte${apres.gouttes > 1 ? "s" : ""}.`];
  if (apres.menace !== menace) lignes.push(`Menace : ${menace} → ${apres.menace}.`);
  await ChatMessage.create({
    speaker: { alias: "La Loi" },
    content: `<h3>Rouage hostile${nom ? ` (${nom})` : ""} : ${nb > 1 ? `${nb} dés de destin à 1` : "1 sur un dé de destin"}</h3><ul>${lignes.map(l => `<li>${l}</li>`).join("")}</ul>`
  });
}
