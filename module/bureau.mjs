/**
 * Le Bureau : guichet de demande de formulaire, papier des documents délivrés,
 * présentation dans le chat.
 */
import {
  FORMULAIRES, ZONES_ACCES, ZONES_SORTIE, DUREES_SORTIE, MODES_REQUISITION, NUISANCES,
  calculerDocument, listeBeneficiaires, numeroDocument, cycleCourant, donneesPapier
} from "./documents-administratifs.mjs";
import { raisonSommeil } from "./sommeil.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const rendre = (...args) => (foundry.applications.handlebars?.renderTemplate ?? renderTemplate)(...args);
const PAPIER = "systems/noc/templates/item/parts/document-papier.hbs";
const nombre = v => Number(v) || 0;
const echapper = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Noms des personnages joueurs actifs (pour la liste des bénéficiaires) */
export function nomsPJ() {
  return game.actors.filter(a => a.type === "personnage" && a.hasPlayerOwner && !raisonSommeil(a))
    .map(a => a.name).sort((a, b) => a.localeCompare(b));
}

/** Montre le papier d'un document dans le chat */
export async function presenterDocument(item, intro = "") {
  if (!item) return;
  const html = await rendre(PAPIER, donneesPapier(item));
  return ChatMessage.create({
    content: `<div class="nocRoll papier-chat">${intro}${html}</div>`,
    speaker: ChatMessage.getSpeaker({ actor: item.actor ?? undefined })
  });
}

/* -------------------------------------------- */
/*  Fenêtre de lecture d'un document             */
/* -------------------------------------------- */

export class PapierDocument extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["noc", "papier-document"],
    window: { title: "Document administratif", icon: "fa-solid fa-file-contract", resizable: true },
    position: { width: 440, height: "auto" },
    actions: { presenter: PapierDocument.#onPresenter }
  };

  static PARTS = { main: { template: "systems/noc/templates/window_app/papier-document.hbs" } };

  constructor(uuid, options = {}) {
    super({ id: `noc-papier-${String(uuid).replace(/\./g, "-")}`, ...options });
    this.uuid = uuid;
  }

  async _prepareContext() {
    const item = fromUuidSync(this.uuid);
    return { papier: item ? donneesPapier(item) : null };
  }

  static async #onPresenter() {
    await presenterDocument(fromUuidSync(this.uuid));
  }
}

export function ouvrirPapier(uuid) {
  return new PapierDocument(uuid).render({ force: true });
}

/* -------------------------------------------- */
/*  Guichet : demande d'un formulaire            */
/* -------------------------------------------- */

function brouillonParDefaut(actor) {
  const modele = foundry.utils.deepClone(game.model?.Item?.["document administratif"] ?? {});
  return foundry.utils.mergeObject(modele, {
    formulaire: "port", beneficiaires: [actor.name, ""], duree: 1, rangSup: 0,
    statut: "brouillon", numero: "", deverrouille: false, description: ""
  });
}

export class GuichetBureau extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["noc", "sheet", "item", "document-administratif", "guichet-bureau"],
    window: { title: "Guichet du Bureau", icon: "fa-solid fa-stamp", resizable: true },
    position: { width: 500, height: 760 },
    actions: {
      jetBureau: GuichetBureau.#onJetBureau,
      budget: GuichetBureau.#onBudget,
      valider: GuichetBureau.#onValider,
      annuler: GuichetBureau.#onAnnuler
    }
  };

  static PARTS = { main: { template: "systems/noc/templates/window_app/guichet-bureau.hbs", scrollable: [""] } };

  constructor(actor, options = {}) {
    super({ id: `noc-guichet-${actor.id}`, ...options });
    this.actor = actor;
    this.brouillon = brouillonParDefaut(actor);
    this.nom = "";
    this.texte = "";
    this.budget = 0;
    // niveau final d'un jet de Bureau de ce personnage : il devient le budget
    this._crochet = (message) => {
      const r = message.getFlag?.("world", "rolldata");
      if (!r || r.actorId !== this.actor.id || r.talentId !== "bureau" || r.niveauFinal === undefined) return;
      this.budget = Math.max(0, nombre(r.niveauFinal));
      this.jetObtenu = true;
      if (this.rendered) this.render();
    };
    this._ids = [Hooks.on("createChatMessage", this._crochet), Hooks.on("updateChatMessage", this._crochet)];
  }

  _onClose(options) {
    Hooks.off("createChatMessage", this._ids[0]);
    Hooks.off("updateChatMessage", this._ids[1]);
    super._onClose?.(options);
  }

  _pseudoItem() {
    return { system: this.brouillon, actor: this.actor };
  }

  async _prepareContext() {
    const calc = calculerDocument(this._pseudoItem());
    const s = this.brouillon;
    const restant = this.budget - calc.niveauxBureau;
    let blocage = "";
    if (calc.rangInsuffisant) blocage = `Rang insuffisant : le document est de Rang ${calc.rangDocument}, le Héros de Rang ${calc.rang}. Augmentez le Rang du Héros (2 niveaux par point).`;
    else if (restant < 0) blocage = `Budget dépassé de ${-restant} niveau${-restant > 1 ? "x" : ""} de Bureau : retirez des options ou relancez le jet.`;
    const formulaires = Object.fromEntries(Object.entries(FORMULAIRES).filter(([k]) => k !== "autre").map(([k, f]) => [k, f.label]));
    return {
      acteur: this.actor.name,
      niveauBureau: nombre(this.actor.system.talents?.erudition?.bureau?.niveau),
      budget: this.budget, jetObtenu: this.jetObtenu, restant, blocage,
      nom: this.nom || FORMULAIRES[calc.type].label,
      texte: this.texte,
      calc, s, editable: true,
      formulaires,
      descriptionFormulaire: FORMULAIRES[calc.type].description,
      zonesAcces: ZONES_ACCES, zonesSortie: ZONES_SORTIE,
      dureesSortie: Object.fromEntries(Object.entries(DUREES_SORTIE).map(([k, d]) => [k, d.label])),
      modesRequisition: MODES_REQUISITION, nuisances: NUISANCES,
      pjs: nomsPJ(),
      beneficiaires: calc.beneficiaires.map((nom, index) => ({ nom, index, numero: index + 1, supprimable: index >= 2 })),
      choix: {
        formulaire: calc.type,
        zoneAcces: String(s.acces?.zone ?? 1),
        zoneSortie: String(s.sortie?.zone ?? 3),
        dureeSortie: s.sortie?.duree || "formulaire",
        modeRequisition: s.requisition?.mode || "objet"
      }
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const html = this.element;
    // champs du formulaire (même nommage que la fiche : system.xxx)
    html.querySelectorAll("[name]").forEach(el => el.addEventListener("change", ev => {
      const cible = ev.currentTarget;
      if (cible.name === "nom") { this.nom = cible.value; return; }
      if (cible.name === "texte") { this.texte = cible.value; return; }
      if (!cible.name.startsWith("system.")) return;
      let valeur = cible.type === "checkbox" ? cible.checked : cible.value;
      if (cible.dataset.dtype === "Number") valeur = nombre(valeur);
      foundry.utils.setProperty(this.brouillon, cible.name.slice(7), valeur);
      this.render();
    }));
    // compteurs +/-
    html.querySelectorAll("a.compteur-plus, a.compteur-moins").forEach(a => a.addEventListener("click", ev => {
      const lien = ev.currentTarget;
      const chemin = lien.dataset.champ.replace(/^system\./, "");
      const min = Number(lien.dataset.min ?? 0);
      const ecart = lien.classList.contains("compteur-plus") ? 1 : -1;
      foundry.utils.setProperty(this.brouillon, chemin, Math.max(min, nombre(foundry.utils.getProperty(this.brouillon, chemin)) + ecart));
      this.render();
    }));
    // bénéficiaires
    html.querySelectorAll("input.beneficiaire").forEach(i => i.addEventListener("change", ev => {
      const liste = listeBeneficiaires(this.brouillon);
      liste[Number(ev.currentTarget.dataset.index)] = ev.currentTarget.value;
      this.brouillon.beneficiaires = liste;
      this.render();
    }));
    html.querySelector("a.ajouter-beneficiaire")?.addEventListener("click", () => {
      this.brouillon.beneficiaires = [...listeBeneficiaires(this.brouillon), ""];
      this.render();
    });
    html.querySelectorAll("a.retirer-beneficiaire").forEach(a => a.addEventListener("click", ev => {
      const liste = listeBeneficiaires(this.brouillon);
      liste.splice(Number(ev.currentTarget.dataset.index), 1);
      this.brouillon.beneficiaires = liste;
      this.render();
    }));
  }

  static #onJetBureau() {
    this.actor.rollTalent("erudition", "bureau");
  }

  static #onBudget(event, target) {
    this.budget = Math.max(0, this.budget + nombre(target.dataset.ecart));
    this.render();
  }

  static async #onValider() {
    const calc = calculerDocument(this._pseudoItem());
    if (calc.rangInsuffisant || calc.niveauxBureau > this.budget) return ui.notifications.warn("La demande ne peut pas être validée : voir l'avertissement du guichet.");
    const system = foundry.utils.deepClone(this.brouillon);
    system.beneficiaires = listeBeneficiaires(system).filter(n => n.trim());
    system.statut = "delivre";
    system.numero = numeroDocument(calc.type);
    system.deverrouille = false;
    system.delivre = { cycle: cycleCourant(), par: this.actor.name, budget: this.budget, niveaux: calc.niveauxBureau, heures: calc.heures };
    system.description = this.texte.trim() ? this.texte.trim().split(/\n+/).map(l => `<p>${echapper(l)}</p>`).join("") : "";
    const nom = (this.nom || FORMULAIRES[calc.type].label).trim();
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{
      name: nom, type: "document administratif",
      img: "systems/noc/asset/default_icons/document_administratif.webp", system
    }]);
    await presenterDocument(item, `<p class="papier-intro"><strong>${echapper(this.actor.name)}</strong> obtient un formulaire après ${calc.heures} heures de démarches dans une Annexe.</p>`);
    this.close();
  }

  static #onAnnuler() {
    this.close();
  }
}

export function ouvrirGuichet(actor) {
  if (!actor?.isOwner) return;
  return new GuichetBureau(actor).render({ force: true });
}
