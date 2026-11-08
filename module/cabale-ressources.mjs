/**
 * Cabales : Personnel et Experts (Rouages au service de la cabale), et recherches
 * des Atouts Fichier et Fragments de vérité (règles avancées, LLO1 p. 117, 121-122).
 *
 * Le Personnel et les Experts sont des Rouages du monde dont les identifiants sont
 * rangés dans system.personnel et system.experts de la cabale.
 */
import { nocUtility } from "./noc-utility.js";
import { fielDesDes } from "./fiel/gouttes.mjs";
import { membresCabale, rouagesCabale } from "./cabale.mjs";

const nombre = v => Number(v) || 0;
const echapper = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Les deux listes d'alliés : clé de données, Atout, places par niveau */
export const ZONES_ALLIES = {
  personnel: { chemin: "system.personnel", atout: "personnel", parNiveau: 2, label: "Personnel", unite: "sympathisant" },
  experts: { chemin: "system.experts", atout: "expert", parNiveau: 1, label: "Experts", unite: "expert" }
};

/** Talents d'un Rouage au-dessus de 0, pour le résumé de la carte */
function talentsNotables(acteur) {
  const liste = [];
  for (const talents of Object.values(acteur.system.talents ?? {})) {
    for (const t of Object.values(talents ?? {})) {
      if (nombre(t?.niveau) > 0) liste.push(`${t.label} ${t.niveau}`);
    }
  }
  return liste.join(", ");
}

/** Données d'affichage des deux listes (onglet Ressources de la fiche de cabale) */
export function alliesCabale(cabale) {
  const s = cabale.system;
  const resultat = {};
  for (const [zone, def] of Object.entries(ZONES_ALLIES)) {
    const niveau = nombre(s.talents?.social?.[def.atout]?.niveau);
    const places = Math.max(0, niveau) * def.parNiveau;
    const liste = (foundry.utils.getProperty(cabale, def.chemin) ?? [])
      .map(id => game.actors.get(id)).filter(Boolean)
      .map(a => ({
        id: a.id, nom: a.name, img: a.img, isOwner: a.isOwner,
        rang: a.system.isMineur === false ? "Rouage majeur" : "Rouage mineur",
        talents: talentsNotables(a)
      }));
    resultat[zone] = { ...def, zone, niveau, places, liste, exces: liste.length > places };
  }
  return resultat;
}

/** Ajoute un Rouage du monde au Personnel ou aux Experts */
export async function ajouterAllie(cabale, zone, acteur) {
  const def = ZONES_ALLIES[zone];
  if (!def) return;
  if (acteur?.type !== "rouage") return ui.notifications.warn("Seuls des Rouages peuvent rejoindre le Personnel ou les Experts.");
  const rouage = game.actors.get(acteur.id);
  if (!rouage) return ui.notifications.warn("Glissez un Rouage depuis l'onglet Acteurs.");
  const ids = [...(foundry.utils.getProperty(cabale._source, def.chemin) ?? [])];
  if (ids.includes(rouage.id)) return ui.notifications.info(`${rouage.name} figure déjà dans cette liste.`);
  // un même Rouage n'est pas à la fois sympathisant et expert
  const maj = { [def.chemin]: [...ids, rouage.id] };
  for (const [autre, d] of Object.entries(ZONES_ALLIES)) {
    if (autre === zone) continue;
    const liste = foundry.utils.getProperty(cabale._source, d.chemin) ?? [];
    if (liste.includes(rouage.id)) maj[d.chemin] = liste.filter(i => i !== rouage.id);
  }
  return cabale.update(maj);
}

/** Retire un Rouage du Personnel ou des Experts */
export async function retirerAllie(cabale, zone, id) {
  const def = ZONES_ALLIES[zone];
  if (!def) return;
  const ids = (foundry.utils.getProperty(cabale._source, def.chemin) ?? []).filter(i => i !== id);
  return cabale.update({ [def.chemin]: ids });
}

/* -------------------------------------------- */
/*  Fichier et Fragments de vérité               */
/* -------------------------------------------- */

/** Recherches disponibles : Atout au niveau 1 ou plus */
export function recherchesCabale(cabale) {
  const s = cabale.system;
  const fichier = nombre(s.talents?.erudition?.fichier?.niveau);
  const fragments = nombre(s.talents?.ame?.fragmentsVerite?.niveau);
  return {
    fichier: fichier > 0 ? { niveau: fichier } : null,
    fragments: fragments > 0 ? { niveau: fragments } : null,
    inutilisables: !!s.atoutsInutilisables
  };
}

/** Héros (ou Rouages membres) que l'utilisateur peut faire chercher */
function chercheurs(cabale) {
  const membres = [...membresCabale(cabale), ...rouagesCabale(cabale)];
  const miens = membres.filter(m => m.isOwner);
  const liste = miens.length ? miens : membres;
  const prefere = game.user.character?.id;
  return liste.sort((a, b) => (b.id === prefere) - (a.id === prefere));
}

function optionsChercheurs(cabale) {
  const liste = chercheurs(cabale);
  if (!liste.length) return `<option value="">${echapper(cabale.name)}</option>`;
  return liste.map(m => `<option value="${m.id}">${echapper(m.name)}</option>`).join("");
}

/** Lance n dés de Destin (8+ = succès, 10 = dé supplémentaire, 1 = goutte de Fiel) */
async function desDuDestin(n, nom) {
  const roll = await new Roll(`${n}d10x10cs>=8`).evaluate();
  await nocUtility.showDiceSoNice?.(roll, game.settings.get("core", "rollMode"));
  const des = roll.dice.flatMap(d => d.results).map(r => ({ result: r.result, success: !!r.success }));
  const fiel = des.filter(d => d.result === 1).length;
  fielDesDes(false, fiel, nom);
  return { des, succes: roll.total, fiel };
}

function htmlDes(des) {
  return `<div class="dicesResults flexrow">${des.map(d =>
    `<div class="dice${d.success ? " success" : ""}${d.result === 1 ? " fiel" : ""}${d.result === 10 ? " relance" : ""}">${d.result} <i class="fa-light fa-dice-d10"></i></div>`
  ).join("")}</div>`;
}

async function annoncer(cabale, chercheur, titre, corps) {
  const auteur = chercheur ?? cabale;
  return ChatMessage.create({
    content: `<div class="nocRoll recherche-cabale"><div class="chat-message-header flexrow"><img src="${auteur.img}" alt=""><h4>${echapper(auteur.name)}<br>${titre}</h4></div>${corps}</div>`,
    speaker: ChatMessage.getSpeaker({ actor: auteur })
  });
}

/** Lecture des champs d'une fenêtre (bouton du formulaire DialogV2) */
function valeurs(bouton) {
  const v = {};
  for (const el of bouton.form.elements) if (el.name) v[el.name] = el.value;
  return v;
}

/** Fichier : une heure de recherche sur un citoyen, autant de dés de Destin que le niveau */
export async function consulterFichier(cabale) {
  const r = recherchesCabale(cabale);
  if (!r.fichier) return;
  if (r.inutilisables) return ui.notifications.warn("Dégradation 5 ou plus : les Atouts de la cabale ne servent plus jusqu'à réparation.");
  const contenu = `<div class="noc recherche-cabale-dialog">
    <p>Une heure de recherche dans les archives de la cabale : ${r.fichier.niveau} dé${r.fichier.niveau > 1 ? "s" : ""} de Destin, une donnée personnelle par succès.</p>
    <div class="form-group"><label>Qui cherche ?</label><select name="chercheur">${optionsChercheurs(cabale)}</select></div>
    <div class="form-group"><label>Citoyen</label><input type="text" name="cible" placeholder="nom du citoyen (facultatif)"></div>
  </div>`;
  const choix = await foundry.applications.api.DialogV2.wait({
    window: { title: `Fichier : ${cabale.name}` },
    classes: ["nocDialog"],
    content: contenu,
    buttons: [
      { action: "chercher", label: "Consulter", icon: "fa-solid fa-folder-open", default: true, callback: (event, bouton) => valeurs(bouton) },
      { action: "annuler", label: "Annuler", icon: "fa-solid fa-times" }
    ],
    rejectClose: false
  });
  if (!choix || typeof choix !== "object") return;
  const chercheur = game.actors.get(choix.chercheur) ?? null;
  const jet = await desDuDestin(r.fichier.niveau, chercheur?.name ?? cabale.name);
  const cible = choix.cible?.trim() ? ` sur <strong>${echapper(choix.cible.trim())}</strong>` : "";
  const resultat = jet.succes > 0
    ? `La Loi révèle <strong>${jet.succes} donnée${jet.succes > 1 ? "s" : ""} personnelle${jet.succes > 1 ? "s" : ""}</strong>${cible}, au choix du Héros.`
    : `Le Fichier ne contient rien d'utile${cible}.`;
  return annoncer(cabale, chercheur, `Fichier de la cabale (${r.fichier.niveau})`,
    `<p>Une heure de recherche dans les archives de ${echapper(cabale.name)}${cible}.</p>${htmlDes(jet.des)}
     <p class="${jet.succes ? "reussite" : "echec"}">${resultat}</p>
     ${jet.fiel ? `<p class="note-combat">Gouttes de Fiel ajoutées : ${jet.fiel}</p>` : ""}`);
}

/** Fragments de vérité : 1 à niveau dés de Destin, une information par succès */
export async function etudierFragments(cabale) {
  const r = recherchesCabale(cabale);
  if (!r.fragments) return;
  if (r.inutilisables) return ui.notifications.warn("Dégradation 5 ou plus : les Atouts de la cabale ne servent plus jusqu'à réparation.");
  const max = r.fragments.niveau;
  const options = Array.from({ length: max }, (_, i) => `<option value="${i + 1}" ${i + 1 === max ? "selected" : ""}>${i + 1}</option>`).join("");
  const contenu = `<div class="noc recherche-cabale-dialog">
    <p>Étudier les Fragments de vérité face à un élément étrange ou occulte : de 1 à ${max} dé${max > 1 ? "s" : ""} de Destin, une information par succès.</p>
    <div class="form-group"><label>Qui étudie ?</label><select name="chercheur">${optionsChercheurs(cabale)}</select></div>
    <div class="form-group"><label>Dés de Destin</label><select name="des">${options}</select></div>
    <div class="form-group"><label>Sujet</label><input type="text" name="sujet" placeholder="élément étudié (facultatif)"></div>
  </div>`;
  const choix = await foundry.applications.api.DialogV2.wait({
    window: { title: `Fragments de vérité : ${cabale.name}` },
    classes: ["nocDialog"],
    content: contenu,
    buttons: [
      { action: "etudier", label: "Étudier", icon: "fa-solid fa-eye", default: true, callback: (event, bouton) => valeurs(bouton) },
      { action: "annuler", label: "Annuler", icon: "fa-solid fa-times" }
    ],
    rejectClose: false
  });
  if (!choix || typeof choix !== "object") return;
  const chercheur = game.actors.get(choix.chercheur) ?? null;
  const n = Math.max(1, Math.min(max, nombre(choix.des) || max));
  const jet = await desDuDestin(n, chercheur?.name ?? cabale.name);
  const sujet = choix.sujet?.trim() ? ` sur <strong>${echapper(choix.sujet.trim())}</strong>` : "";
  const resultat = jet.succes > 0
    ? `La Loi apporte <strong>${jet.succes} information${jet.succes > 1 ? "s" : ""}</strong> complémentaire${jet.succes > 1 ? "s" : ""} ou donnée${jet.succes > 1 ? "s" : ""} exploitable${jet.succes > 1 ? "s" : ""}${sujet}.`
    : `Les fragments restent muets${sujet}.`;
  return annoncer(cabale, chercheur, `Fragments de vérité (${n} dé${n > 1 ? "s" : ""})`,
    `<p>Étude des fragments de vérité de ${echapper(cabale.name)}${sujet}.</p>${htmlDes(jet.des)}
     <p class="${jet.succes ? "reussite" : "echec"}">${resultat}</p>
     ${jet.fiel ? `<p class="note-combat">Gouttes de Fiel ajoutées : ${jet.fiel}</p>` : ""}`);
}
