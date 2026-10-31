/**
 * Gouttes de Fiel produites par les dés de destin (livre de base p. 231).
 *
 * - Héros ou Rouage allié : chaque 1 ajoute une goutte de Fiel.
 * - Rouage hostile ou opposé aux Héros : chaque 1 retire une goutte de la jauge.
 *   Si la jauge est vide, un Héros désigné par la Loi gagne 1 point de Singularité.
 *
 * Jauge vide : dans ce système, les gouttes s'accumulent de 0 à 35 et la Menace vaut
 * une tranche de 5. La jauge du livre (0 à 4) est donc le reste de la division par 5 :
 * elle est vide sur un multiple de 5. On ne descend pas plus bas, pour ne pas faire
 * baisser la Menace (qui ne baisse qu'en début de séance), ni sous le plancher dû à
 * la Noirceur d'une cabale.
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

/** (MJ) Un Rouage hostile a obtenu nb fois 1 : la jauge baisse, ou un Héros gagne de la Singularité */
export async function retirerGouttesHostiles(nb, nom = "") {
  if (!game.users.activeGM?.isSelf) return;
  const { gouttes } = etatFiel();
  const plancher = plancherFiel();
  let g = gouttes;
  let singularite = 0;
  for (let i = 0; i < nb; i++) {
    if (g % 5 > 0 && g - 1 >= plancher) g -= 1;
    else singularite += 1;
  }
  if (g !== gouttes) await fixerFiel(g);
  const qui = nom ? ` (${nom})` : "";
  const lignes = [];
  if (g !== gouttes) lignes.push(`Fiel : ${gouttes} → ${g} goutte${g > 1 ? "s" : ""}.`);
  if (singularite) lignes.push(singularite > 1
    ? `La jauge de Fiel est vide : ${singularite} fois, un Héros désigné par la Loi gagne 1 point de Singularité.`
    : "La jauge de Fiel est vide : un Héros désigné par la Loi gagne 1 point de Singularité.");
  await ChatMessage.create({
    speaker: { alias: "La Loi" },
    content: `<h3>Rouage hostile${qui} : ${nb > 1 ? `${nb} dés de destin à 1` : "1 sur un dé de destin"}</h3><ul>${lignes.map(l => `<li>${l}</li>`).join("")}</ul>`
  });
}
