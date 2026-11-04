/**
 * Fortune et transactions (livre de base p. 241).
 *
 * - Fortune ≥ valeur : acquis ; Fortune = valeur − 1 : acquis, mais excès ;
 *   Fortune ≤ valeur − 2 : impossible.
 * - Faveurs : 1 point donne +1 en Fortune pour la transaction, 5 points +2.
 *   Les points sont une monnaie (règle maison) : ils sont placés sur le contact sollicité.
 * - Excès : Fortune −1 jusqu'au début du scénario suivant (flags.noc.exces).
 *   Ni le second excès dans le mois, ni les achats répétés ne sont suivis (décision du MJ).
 */

const nombre = v => Number(v) || 0;
const echapper = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Types d'objets qui ont une valeur et peuvent s'acheter */
export const TYPES_ACHETABLES = ["arme", "outil", "armure"];

/** Excès : Fortune −1 (appelé à la préparation de l'acteur) */
export function appliquerExces(actor) {
  if (!actor.flags?.noc?.exces) return;
  const t = actor.system.talents?.statut?.fortune;
  if (!t) return;
  t.niveau = nombre(t.niveau) - 1;
  actor.overrides ??= {};
  foundry.utils.setProperty(actor.overrides, "system.talents.statut.fortune.niveau", t.niveau);
}

/** Résultat d'une transaction */
export function resultatTransaction(fortune, valeur, bonus = 0) {
  const ecart = nombre(fortune) + nombre(bonus) - nombre(valeur);
  if (ecart >= 0) return { cle: "acquis", label: "Acquis", texte: "Achat sans problème." };
  if (ecart === -1) return { cle: "exces", label: "Excès", texte: "Achat possible, mais c'est un excès : Fortune −1 jusqu'à la fin du scénario." };
  return { cle: "impossible", label: "Impossible", texte: "Le personnage ne peut pas se l'offrir." };
}

/** Points de Faveur encore disponibles (non placés sur un contact) */
function faveursDisponibles(actor) {
  const r = actor.system.reserves?.faveurs ?? {};
  return Math.max(0, nombre(r.max) - nombre(r.value));
}

/** Place n jetons de Faveur sur un contact (ou dans la réserve s'il n'y en a pas) */
async function depenserFaveurs(actor, n, indexContact) {
  if (!n) return "";
  const maj = { "system.reserves.faveurs.value": nombre(actor.system.reserves.faveurs.value) + n };
  const contacts = foundry.utils.deepClone(actor.system.contacts ?? []);
  const c = contacts[indexContact];
  if (c) {
    c.faveurs = nombre(c.faveurs) + n;
    c.usedFaveurs = nombre(c.usedFaveurs) + n;
    maj["system.contacts"] = contacts;
  }
  await actor.update(maj);
  return c?.nom ?? "";
}

/**
 * Fenêtre de transaction. Renvoie le résultat ({cle, ...}) ou null si annulée.
 * Un achat impossible n'est pas conclu.
 */
export async function transaction(actor, { nom = "", valeur = 0, objet = false } = {}) {
  if (actor.type !== "personnage") return null;
  const fortune = nombre(actor.system.talents?.statut?.fortune?.niveau);
  const dispo = faveursDisponibles(actor);
  const contacts = (actor.system.contacts ?? []).filter(c => c && typeof c === "object");
  const optionsFaveurs = [
    `<option value="0">Aucune</option>`,
    `<option value="1" ${dispo >= 1 ? "" : "disabled"}>1 point : Fortune +1</option>`,
    `<option value="5" ${dispo >= 5 ? "" : "disabled"}>5 points : Fortune +2</option>`
  ].join("");
  const optionsContacts = contacts.map((c, i) => `<option value="${i}">${echapper(c.nom)}</option>`).join("");
  const exces = actor.flags?.noc?.exces
    ? `<p class="ligne-grise">Déjà en excès dans ce scénario : Fortune comptée avec son malus de −1.</p>` : "";
  const content = `<div class="transaction-fortune">
    <p>Fortune de ${echapper(actor.name)} : <strong>${fortune}</strong></p>${exces}
    <div class="form-group"><label>Bien ou service</label><input type="text" name="nom" value="${echapper(nom)}" ${objet ? "readonly" : ""} placeholder="ex. une nuit d'hôtel, un pot-de-vin"></div>
    <div class="form-group"><label>Valeur</label><input type="number" name="valeur" value="${nombre(valeur)}" min="0" max="10" step="1" ${objet ? "readonly" : ""}></div>
    <div class="form-group"><label>Faveurs (${dispo} disponible${dispo > 1 ? "s" : ""})</label><select name="faveurs">${optionsFaveurs}</select></div>
    ${contacts.length ? `<div class="form-group"><label>Contact sollicité</label><select name="contact">${optionsContacts}</select></div>` : ""}
    <p class="ligne-grise">Fortune ≥ valeur : acquis. Fortune = valeur − 1 : excès (Fortune −1 jusqu'à la fin du scénario). Moins : impossible.</p>
  </div>`;
  const choix = await foundry.applications.api.DialogV2.wait({
    window: { title: "Transaction" },
    classes: ["nocDialog"],
    content,
    buttons: [
      { action: "ok", label: "Acheter", icon: "fas fa-coins", default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          return { nom: f.nom.value.trim(), valeur: nombre(f.valeur.value), faveurs: nombre(f.faveurs.value), contact: nombre(f.contact?.value) };
        } },
      { action: "annuler", label: "Annuler", icon: "fas fa-times" }
    ],
    rejectClose: false
  });
  if (!choix || choix === "annuler") return null;

  const bonus = choix.faveurs >= 5 ? 2 : choix.faveurs >= 1 ? 1 : 0;
  const res = resultatTransaction(fortune, choix.valeur, bonus);
  const lignes = [`Valeur ${choix.valeur} — Fortune ${fortune}${bonus ? ` + ${bonus} (Faveurs)` : ""}`];
  // un achat impossible n'est pas conclu : les Faveurs ne sont pas dépensées
  if (res.cle !== "impossible" && choix.faveurs) {
    const contact = await depenserFaveurs(actor, choix.faveurs, choix.contact);
    lignes.push(`${choix.faveurs} point${choix.faveurs > 1 ? "s" : ""} de Faveur${contact ? ` (${echapper(contact)})` : ""}`);
  }
  if (res.cle === "exces") {
    if (actor.flags?.noc?.exces) lignes.push("Nouvel excès dans le scénario : à la Loi de juger.");
    else await actor.setFlag("noc", "exces", true);
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="nocRoll"><h3>Transaction : ${echapper(choix.nom || "achat")}</h3>
      <p><strong>${res.label}</strong> — ${res.texte}</p><ul>${lignes.map(l => `<li>${l}</li>`).join("")}</ul></div>`
  });
  return res;
}

/**
 * Objet glissé sur la fiche d'un personnage : achat ou sans achat ?
 * Renvoie true si l'objet doit être ajouté.
 */
export async function acquisitionObjet(actor, item) {
  const choix = await foundry.applications.api.DialogV2.wait({
    window: { title: `Ajouter : ${item.name}` },
    classes: ["nocDialog"],
    content: `<p>Comment ${echapper(actor.name)} obtient-il <strong>${echapper(item.name)}</strong> (valeur ${nombre(item.system?.valeur)}) ?</p>`,
    buttons: [
      { action: "achat", label: "Achat", icon: "fas fa-coins", default: true },
      { action: "sans", label: "Sans achat (création, don, butin)", icon: "fas fa-gift" },
      { action: "annuler", label: "Annuler", icon: "fas fa-times" }
    ],
    rejectClose: false
  });
  if (choix === "sans") return true;
  if (choix !== "achat") return false;
  const res = await transaction(actor, { nom: item.name, valeur: nombre(item.system?.valeur), objet: true });
  return !!res && res.cle !== "impossible";
}

/** Le MJ signale ou lève un excès (bouton de la fiche) */
export async function basculerExces(actor) {
  if (!game.user.isGM) return;
  if (actor.flags?.noc?.exces) {
    await actor.unsetFlag("noc", "exces");
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      content: `<p>${echapper(actor.name)} : excès levé par la Loi.</p>` });
  }
  await actor.setFlag("noc", "exces", true);
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p>${echapper(actor.name)} commet un excès : Fortune −1 jusqu'à la fin du scénario.</p>` });
}
