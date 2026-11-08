/**
 * Réserves en jeu (Livre de base p. 233 et 252), depuis les messages de chat :
 * - Singularité : 1 point empêche l'ajout d'une goutte de Fiel (une fois par 1 obtenu) ;
 * - Espoir contre les perditions : 1 point, 3 dés de destin, chaque succès retire 1 point subi ;
 * - Perdre Espoir : au 10e point de Blessures, Trauma, Traque ou Noirceur, sacrifier 1 niveau
 *   de Ferveur pour échapper au danger et revenir à 9 points.
 * Les messages sont marqués (flags.noc) par la Loi, via le socket si besoin.
 */
import { NOC } from "./helpers/config.mjs";
import { fielDesDes } from "./fiel/gouttes.mjs";

const nombre = v => Number(v) || 0;
const echapper = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LIBELLES = { blessures: "Blessures", trauma: "Trauma", traque: "Traque", noirceur: "Noirceur" };

/* -------------------------------------------- */
/*  Outils                                       */
/* -------------------------------------------- */

/** Lance n dés de destin (8+ = succès, 10 = dé supplémentaire, 1 = goutte de Fiel) */
export async function desDuDestin(n, nom, hostile = false) {
  const roll = await new Roll(`${n}d10x10cs>=8`).evaluate();
  if (game.modules.get("dice-so-nice")?.active) await game.dice3d?.showForRoll(roll, game.user, true);
  const des = roll.dice.flatMap(d => d.results).map(r => ({ result: r.result, success: !!r.success }));
  const fiel = des.filter(d => d.result === 1).length;
  fielDesDes(hostile, fiel, nom);
  return { des, succes: roll.total, fiel };
}

function htmlDes(des) {
  return `<div class="dicesResults flexrow">${des.map(d =>
    `<div class="dice${d.success ? " success" : ""}${d.result === 1 ? " fiel" : ""}${d.result === 10 ? " relance" : ""}">${d.result} <i class="fa-light fa-dice-d10"></i></div>`).join("")}</div>`;
}

/** Marque un message (flags.noc) : directement pour la Loi, par le socket sinon */
export async function marquerMessage(messageId, chemin, valeur) {
  const message = game.messages.get(messageId);
  if (!message) return;
  if (game.user.isGM) return message.update({ [`flags.noc.${chemin}`]: valeur });
  game.socketManager.launchSocket("marquerMessage", { messageId, chemin, valeur });
}

/** Retire une goutte de Fiel (la Loi applique, par le socket si besoin) */
function retirerGoutte() {
  if (game.user.isGM) return ui.compteur?.goutteMoins(1);
  game.socketManager.launchSocket("goutteMoins", { qt: 1 });
}

function destinataires(actor) {
  return game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id);
}

/* -------------------------------------------- */
/*  Singularité contre une goutte de Fiel        */
/* -------------------------------------------- */

/** Héros pouvant dépenser de la Singularité (ceux de l'utilisateur, ou tous pour la Loi) */
function porteursSingularite() {
  return game.actors.filter(a => a.type === "personnage" && a.isOwner && nombre(a.system.reserves?.singularite?.value) > 0
    && (game.user.isGM || a.hasPlayerOwner));
}

export async function singulariteContreFiel(message, bouton) {
  const max = nombre(bouton.dataset.max);
  const utilises = nombre(message.flags?.noc?.singularite);
  if (utilises >= max) return ui.notifications.info("Toutes les gouttes de ce jet ont déjà été annulées.");
  let porteurs = porteursSingularite();
  const prefere = game.user.character;
  if (prefere && porteurs.includes(prefere)) porteurs = [prefere, ...porteurs.filter(a => a !== prefere)];
  if (!porteurs.length) return ui.notifications.warn("Aucun de vos Héros n'a de point de Singularité.");
  let heros = porteurs[0];
  if (porteurs.length > 1) {
    const { formulaire } = await import("./sheets/v2-outils.mjs");
    const f = await formulaire("Singularité contre le Fiel", `
      <p class="notes">Dépenser 1 point de Singularité pour empêcher l'ajout d'une goutte de Fiel.</p>
      <div class="form-group"><label>Héros</label><select name="heros">${porteurs.map(a =>
        `<option value="${a.id}">${echapper(a.name)} (${nombre(a.system.reserves.singularite.value)})</option>`).join("")}</select></div>`,
      { valider: "Dépenser", icone: "fa-solid fa-atom" });
    if (!f) return;
    heros = game.actors.get(f.heros);
    if (!heros) return;
  }
  const avant = nombre(heros.system.reserves.singularite.value);
  await heros.update({ "system.reserves.singularite.value": avant - 1 });
  retirerGoutte();
  await marquerMessage(message.id, "singularite", utilises + 1);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: heros }),
    content: `<div class="nocRoll"><p><strong>${echapper(heros.name)}</strong> dépense 1 point de Singularité (${avant} → ${avant - 1}) : une goutte de Fiel en moins.</p></div>`
  });
}

/* -------------------------------------------- */
/*  Espoir contre les perditions                 */
/* -------------------------------------------- */

/**
 * Propose aux Héros qui viennent de subir des points (et ont de l'Espoir) d'y résister.
 * @param {string} cle            perdition
 * @param {Map<Actor, number>} avant  valeurs avant les points subis
 */
export async function proposerResistance(cle, avant) {
  const lignes = [];
  const touches = [];
  for (const [actor, valeurAvant] of avant) {
    if (actor.type !== "personnage") continue;
    const apres = nombre(actor.system.perditions?.[cle]?.value);
    if (apres <= valeurAvant || nombre(actor.system.reserves?.espoir?.value) < 1) continue;
    touches.push(actor);
    lignes.push(`<li class="flexrow"><span><strong>${echapper(actor.name)}</strong> : ${LIBELLES[cle]} ${valeurAvant} → ${apres}</span>
      <a class="resister-espoir" data-uuid="${actor.uuid}" data-cle="${cle}" data-avant="${valeurAvant}" data-apres="${apres}"><i class="fa-solid fa-heart"></i> Résister (1 Espoir)</a></li>`);
  }
  if (!lignes.length) return;
  const recus = new Set([...touches.flatMap(destinataires)]);
  return ChatMessage.create({
    speaker: { alias: "La Loi" },
    whisper: [...recus],
    content: `<div class="nocRoll resistance-espoir"><p>Points de ${LIBELLES[cle]} subis : un Héros peut dépenser 1 point d'Espoir pour lancer 3 dés de destin ; chaque succès retire 1 point subi.</p><ul>${lignes.join("")}</ul></div>`
  });
}

export async function resisterAvecEspoir(message, bouton) {
  const { uuid, cle } = bouton.dataset;
  const marque = `resistance.${uuid.replace(/\./g, "_")}`;
  if (foundry.utils.getProperty(message.flags?.noc ?? {}, marque.replace(/^/, ""))) return ui.notifications.info("Résistance déjà tentée.");
  const actor = await fromUuid(uuid);
  if (!actor?.isOwner) return ui.notifications.warn("Ce Héros n'est pas le vôtre.");
  const espoir = nombre(actor.system.reserves?.espoir?.value);
  if (espoir < 1) return ui.notifications.warn(`${actor.name} n'a plus d'Espoir.`);
  const avantPoints = nombre(bouton.dataset.avant);
  const actuel = nombre(actor._source.system.perditions?.[cle]?.value);
  const jet = await desDuDestin(3, actor.name);
  const retire = Math.max(0, Math.min(jet.succes, actuel - avantPoints));
  const final = actuel - retire;
  const maj = { "system.reserves.espoir.value": espoir - 1 };
  const notes = [];
  if (retire) {
    maj[`system.perditions.${cle}.value`] = final;
    // seuil de séquelle franchi par ces points et évité : la séquelle est annulée
    for (const seuil of [5, 8, 10]) {
      const def = NOC.effetsPerditions?.[cle]?.[seuil];
      if (!(avantPoints < seuil && final < seuil && actuel >= seuil)) continue;
      if (def?.sequelle) {
        const min = nombre(actor._source.system.perditions?.[cle]?.min);
        maj[`system.perditions.${cle}.min`] = Math.max(0, Math.min(min - 1, final));
        notes.push(`séquelle du seuil ${seuil} annulée`);
      }
      if (def?.trait) notes.push(`trait du seuil ${seuil} à retirer par la Loi si besoin`);
    }
  }
  await actor.update(maj);
  await marquerMessage(message.id, marque, true);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: destinataires(actor),
    content: `<div class="nocRoll"><h4>${echapper(actor.name)} résiste avec l'Espoir</h4>${htmlDes(jet.des)}
      <p>${jet.succes} succès : ${LIBELLES[cle]} ${actuel} → <strong>${final}</strong> ; Espoir ${espoir} → ${espoir - 1}${notes.length ? ` (${notes.join(" ; ")})` : ""}.</p>
      ${jet.fiel ? `<p class="note-combat">Gouttes de Fiel ajoutées : ${jet.fiel}</p>` : ""}</div>`
  });
}

/* -------------------------------------------- */
/*  Perdre Espoir (10e point)                    */
/* -------------------------------------------- */

const ISSUES = {
  blessures: "laissé pour mort, il se réveille à la fin de la scène",
  trauma: "il sombre dans l'inconscience ou la catatonie et retrouve sa lucidité à la fin de la scène",
  noirceur: "il vomit ou pleure du Fiel, fiévreux et halluciné, et retrouve sa vitalité à la fin de la scène",
  traque: "il se dissimule miraculeusement, aidé par des erreurs administratives, et se fait discret jusqu'à la fin de la scène"
};

/** Bouton « Perdre Espoir » à ajouter au message de seuil (null si impossible) */
export function boutonPerdreEspoir(actor, cle) {
  if (actor.type !== "personnage" || !ISSUES[cle]) return "";
  if (nombre(actor.system.talents?.vie?.ferveur?.niveau) <= -1) return "";
  return `<p><a class="perdre-espoir" data-uuid="${actor.uuid}" data-cle="${cle}" data-tooltip="Sacrifier définitivement 1 niveau de Ferveur pour échapper au danger (livre p. 252)"><i class="fa-solid fa-heart-crack"></i> Perdre Espoir : revenir à 9 en ${LIBELLES[cle]}</a></p>`;
}

export async function perdreEspoir(message, bouton) {
  const { uuid, cle } = bouton.dataset;
  const marque = `perdreEspoir.${cle}`;
  if (foundry.utils.getProperty(message.flags?.noc ?? {}, marque)) return ui.notifications.info("Déjà fait.");
  const actor = await fromUuid(uuid);
  if (!actor?.isOwner) return ui.notifications.warn("Ce Héros n'est pas le vôtre.");
  const ferveur = nombre(actor.system.talents?.vie?.ferveur?.niveau);
  if (ferveur <= -1) return ui.notifications.warn("Ferveur déjà à −1 : impossible.");
  const valeur = nombre(actor._source.system.perditions?.[cle]?.value);
  if (valeur < 10) return ui.notifications.info(`${LIBELLES[cle]} n'est plus à 10.`);
  const { confirmer } = await import("./sheets/v2-outils.mjs");
  const ok = await confirmer(`Perdre Espoir : ${actor.name}`,
    `<p>Sacrifier définitivement 1 niveau de Ferveur (${ferveur} → ${ferveur - 1}, réserve d'Espoir plus petite) pour échapper au danger et revenir à 9 en ${LIBELLES[cle]} ?</p>`);
  if (!ok) return;
  const base = nombre(actor._source.system.talents?.vie?.ferveur?.niveau);
  const maj = { "system.talents.vie.ferveur.niveau": base - 1, [`system.perditions.${cle}.value`]: 9 };
  const notes = [];
  if (cle === "traque") {
    const traits = [...(actor._source.system.traits ?? [])];
    const i = traits.findIndex(t => t?.label === "ennemi public");
    if (i >= 0) {
      if (traits.some(t => t?.label === "criminel")) traits.splice(i, 1);
      else traits.splice(i, 1, NOC.traitsPerditions.traque.criminel);
      maj["system.traits"] = traits;
      notes.push("Ennemi public redevient Criminel");
    }
  }
  if (cle === "noirceur") notes.push("trait de Noirceur ou gabarit du seuil 10 à retirer par la Loi si besoin");
  await actor.update(maj);
  await marquerMessage(message.id, marque, true);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="nocRoll perdre-espoir-chat"><h4>${echapper(actor.name)} perd Espoir</h4>
      <p>Ferveur ${ferveur} → ${ferveur - 1}. ${echapper(actor.name)} échappe miraculeusement au danger : ${ISSUES[cle]}, avec 9 points de ${LIBELLES[cle]}.${notes.length ? ` (${notes.join(" ; ")})` : ""}</p></div>`
  });
}

/* -------------------------------------------- */
/*  Écouteurs des messages                       */
/* -------------------------------------------- */

/** Branche les boutons d'un message et grise ceux déjà utilisés */
export function activerBoutonsReserves(html) {
  const messageDe = el => game.messages.get(el.closest("[data-message-id]")?.dataset.messageId);
  const nouveaux = sel => [...html.querySelectorAll(sel)].filter(el => !el.dataset.nocLie && (el.dataset.nocLie = "1"));
  for (const el of nouveaux("a.singularite-fiel")) {
    const message = messageDe(el);
    if (message && nombre(message.flags?.noc?.singularite) >= nombre(el.dataset.max)) el.classList.add("utilise");
    el.addEventListener("click", ev => { ev.preventDefault(); if (message) singulariteContreFiel(message, el); });
  }
  for (const el of nouveaux("a.resister-espoir")) {
    const message = messageDe(el);
    if (message && foundry.utils.getProperty(message.flags?.noc ?? {}, `resistance.${el.dataset.uuid.replace(/\./g, "_")}`)) el.classList.add("utilise");
    el.addEventListener("click", ev => { ev.preventDefault(); if (message) resisterAvecEspoir(message, el); });
  }
  for (const el of nouveaux("a.perdre-espoir")) {
    const message = messageDe(el);
    if (message && foundry.utils.getProperty(message.flags?.noc ?? {}, `perdreEspoir.${el.dataset.cle}`)) el.classList.add("utilise");
    el.addEventListener("click", ev => { ev.preventDefault(); if (message) perdreEspoir(message, el); });
  }
}
