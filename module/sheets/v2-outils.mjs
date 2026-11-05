/**
 * Outils communs aux fiches ApplicationV2 (acteurs et objets) du système NOC.
 *
 * Les fiches n'utilisent ni jQuery ni les mécanismes des fiches V1 : écouteurs
 * posés à chaque rendu sur le contenu (remplacé à chaque rendu), onglets, éditeurs
 * de texte riche, image du document, glisser-déposer et position de défilement
 * gérés ici, sans dépendre des réglages internes de Foundry.
 */

const api = foundry.applications.api;

/** Éditeur de texte riche (classe de Foundry, v13 et suivantes) */
function classeEditeur() {
  return foundry.applications.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
}

/** Glisser-déposer (classe de Foundry, v13 et suivantes) */
function classeDragDrop() {
  return foundry.applications.ux?.DragDrop?.implementation ?? globalThis.DragDrop;
}

/** Sélecteur de fichiers (classe de Foundry, v13 et suivantes) */
function classeFilePicker() {
  return foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

/** Données d'un glisser (JSON du dataTransfer) */
export function donneesGlisser(event) {
  return classeEditeur().getDragEventData(event);
}

/** Rendu d'un modèle Handlebars */
export function rendreModele(chemin, donnees) {
  return foundry.applications.handlebars.renderTemplate(chemin, donnees);
}

/**
 * Pose un écouteur sur chaque élément du sélecteur.
 * Le gestionnaire reçoit l'évènement ; event.currentTarget est l'élément visé.
 */
export function ecouter(racine, selecteur, gestionnaire, type = "click") {
  for (const el of racine.querySelectorAll(selecteur)) el.addEventListener(type, gestionnaire);
}

/** Échappe un texte pour un attribut HTML */
export function echapper(t) {
  return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Textes enrichis (liens, jets…) des champs de texte riche du document */
export async function enrichirChamps(document, chemins) {
  const enrichi = {};
  for (const chemin of chemins) {
    const brut = foundry.utils.getProperty(document, chemin) ?? "";
    enrichi[chemin] = await classeEditeur().enrichHTML(String(brut), {
      relativeTo: document, secrets: document.isOwner, rollData: document.getRollData?.()
    });
  }
  return enrichi;
}

/**
 * Assistant Handlebars {{nocEditeur "system.description"}} : éditeur ProseMirror
 * (bouton d'édition) si la fiche est modifiable, texte enrichi sinon.
 * Le contexte doit contenir document, editable et enrichi (voir enrichirChamps).
 */
export function enregistrerAssistantEditeur() {
  Handlebars.registerHelper("nocEditeur", function (chemin, options) {
    const racine = options?.data?.root ?? {};
    const doc = racine.document;
    const brut = String(foundry.utils.getProperty(doc ?? {}, chemin) ?? "");
    const enrichi = racine.enrichi?.[chemin] ?? brut;
    if (!racine.editable) return new Handlebars.SafeString(`<div class="editor"><div class="editor-content">${enrichi}</div></div>`);
    return new Handlebars.SafeString(
      `<prose-mirror class="editor" name="${echapper(chemin)}" toggled value="${echapper(brut)}"${doc?.uuid ? ` document-uuid="${echapper(doc.uuid)}"` : ""}>${enrichi}</prose-mirror>`
    );
  });
}

/**
 * Onglets : liens nav.sheet-tabs [data-tab] et contenus .tab[data-tab].
 * L'onglet affiché est gardé d'un rendu à l'autre (app._ongletActif).
 */
export function activerOnglets(app, racine, initial) {
  const nav = racine.querySelector("nav.sheet-tabs");
  if (!nav) return;
  const liens = [...nav.querySelectorAll("[data-tab]")];
  const contenus = [...racine.querySelectorAll(".tab[data-tab]")].filter(el => !nav.contains(el));
  const existe = id => contenus.some(c => c.dataset.tab === id);
  const afficher = id => {
    app._ongletActif = id;
    for (const l of liens) l.classList.toggle("active", l.dataset.tab === id);
    for (const c of contenus) c.classList.toggle("active", c.dataset.tab === id);
  };
  for (const l of liens) {
    l.addEventListener("click", ev => {
      ev.preventDefault();
      afficher(l.dataset.tab);
    });
  }
  afficher(existe(app._ongletActif) ? app._ongletActif : (existe(initial) ? initial : contenus[0]?.dataset.tab));
}

/** Image du document : sélecteur de fichiers (img[data-edit] avec data-action="editImage") */
export async function changerImage(app, cible) {
  if (!app.isEditable) return;
  const attribut = cible.dataset.edit || "img";
  const actuel = foundry.utils.getProperty(app.document._source, attribut);
  const fp = new (classeFilePicker())({
    current: actuel,
    type: "image",
    redirectToRoot: actuel ? [actuel] : [],
    callback: chemin => app.document.update({ [attribut]: chemin }),
    position: { top: app.position.top + 40, left: app.position.left + 10 }
  });
  return fp.browse();
}

/**
 * Glisser-déposer de la fiche : les sources (sélecteurs) deviennent glissables ;
 * les dépôts sur toute la fiche passent par app._onDrop. Un même évènement
 * n'est traité qu'une fois, même si Foundry lie aussi son propre gestionnaire.
 */
export function lierGlisser(app, racine, sources) {
  const DD = classeDragDrop();
  if (!DD) return;
  const unique = (fn) => (event) => {
    if (event._nocTraite) return;
    event._nocTraite = true;
    return fn(event);
  };
  new DD({
    dragSelector: sources,
    dropSelector: null,
    permissions: { dragstart: () => app.isEditable, drop: () => app.isEditable },
    callbacks: {
      dragstart: unique(ev => app._onDragStart(ev)),
      dragover: ev => ev.preventDefault?.(),
      drop: unique(ev => app._onDrop(ev))
    }
  }).bind(racine);
}

/** Position de défilement des zones de la fiche, gardée d'un rendu à l'autre */
export const ZONES_DEFILEMENT = [".sheet-body", ".tab.active", ".guichet"];

export function memoriserDefilement(app) {
  const el = app.element;
  if (!el) return;
  app._nocDefilement = ZONES_DEFILEMENT.map(sel => el.querySelector(sel)?.scrollTop ?? 0);
}

export function restaurerDefilement(app) {
  const el = app.element;
  if (!el || !app._nocDefilement) return;
  ZONES_DEFILEMENT.forEach((sel, i) => {
    const zone = el.querySelector(sel);
    if (zone && app._nocDefilement[i]) zone.scrollTop = app._nocDefilement[i];
  });
}

/** Boutons +/- génériques d'une fiche (data-champ = chemin de la valeur, minimum 0) */
export function activerCompteursV2(racine, document) {
  const changer = async (champ, ecart) => {
    const valeur = Math.max(0, (Number(foundry.utils.getProperty(document._source, champ)) || 0) + ecart);
    return document.update({ [champ]: valeur });
  };
  ecouter(racine, "a.compteur-plus", ev => changer(ev.currentTarget.dataset.champ, 1));
  ecouter(racine, "a.compteur-moins", ev => changer(ev.currentTarget.dataset.champ, -1));
}

/* -------------------------------------------- */
/*  Fenêtres de dialogue simples (DialogV2)      */
/* -------------------------------------------- */

/** Confirmation oui / non */
export function confirmer(titre, contenu) {
  return api.DialogV2.confirm({ window: { title: titre }, classes: ["nocDialog"], content: contenu, rejectClose: false });
}

/**
 * Fenêtre à formulaire : renvoie les valeurs du formulaire (objet nom → valeur)
 * si l'on valide, null sinon.
 */
export async function formulaire(titre, contenu, { valider = "Valider", icone = "fas fa-check" } = {}) {
  const resultat = await api.DialogV2.wait({
    window: { title: titre },
    classes: ["nocDialog"],
    content: contenu,
    buttons: [
      {
        action: "valider", label: valider, icon: icone, default: true,
        callback: (event, bouton) => {
          const valeurs = {};
          for (const el of bouton.form.elements) {
            if (!el.name) continue;
            valeurs[el.name] = el.type === "checkbox" ? el.checked : el.value;
          }
          return valeurs;
        }
      },
      { action: "annuler", label: "Annuler", icon: "fas fa-times" }
    ],
    rejectClose: false
  });
  return resultat && typeof resultat === "object" ? resultat : null;
}
