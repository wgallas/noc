/**
 * Fiche d'acteur ApplicationV2 commune (personnage, rouage, Autre, créature, cabale).
 * Chaque type a sa sous-classe (classe CSS, taille, modèle) ; la logique est ici.
 */
import { raisonSommeil } from "../../sommeil.mjs";
import { ouvrirGuichet, ouvrirPapier } from "../../bureau.mjs";
import { documentsRecus, validite } from "../../documents-administratifs.mjs";
import { choisirTheme, libelleTalent } from "../../archetypes.mjs";
import { TYPES_GABARIT, gabaritDe, resumeGabarit } from "../../gabarits.mjs";
import { outilUtilisableCommeArme } from "../../stratagemes.mjs";
import { TYPES_ACHETABLES, acquisitionObjet, basculerExces, transaction } from "../../fortune.mjs";
import { choisirQualite, descriptionQualite, enregistrerQualite } from "../../qualites.mjs";
import { appliquerRegression, corrigerProgression, depenserProgressionHeros, ouvrirHistorique, passageOuvert } from "../../progression.mjs";
import {
  activerOnglets, changerImage, confirmer, donneesGlisser, ecouter, echapper, enrichirChamps,
  formulaire, lierGlisser, memoriserDefilement, rendreModele, restaurerDefilement
} from "../v2-outils.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class NocFicheActeur extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["noc", "sheet", "actor"],
    position: { width: 850, height: 710 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: function (event, cible) { return changerImage(this, cible); }
    }
  };

  /** Modèle de la fiche complète (défini par chaque sous-classe) */
  static MODELE = "systems/noc/templates/actor/actor-personnage-sheet.html";
  static MODELE_LIMITE = "systems/noc/templates/actor/limitted.html";
  /** Onglet affiché à l'ouverture */
  static ONGLET_INITIAL = "principal";
  /** Champs de texte riche de la fiche */
  static EDITEURS = ["system.description"];
  /** Éléments glissables de la fiche */
  static GLISSABLES = ".item-list .item, img.quantarQty, img.quantarUsed, .faveur";

  static PARTS = {
    main: { template: "systems/noc/templates/actor/actor-personnage-sheet.html" }
  };

  /** Fiche limitée : observateurs et accès limité */
  get estLimitee() {
    return !game.user.isGM && !this.actor.isOwner;
  }

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.main = { ...(parts.main ?? {}), template: this.estLimitee ? this.constructor.MODELE_LIMITE : this.constructor.MODELE };
    return parts;
  }

  /* -------------------------------------------- */
  /*  Contexte                                     */
  /* -------------------------------------------- */

  /** Titre de la fenêtre : le nom de l'acteur seul (comme les anciennes fiches) */
  get title() {
    return this.document.isToken ? `[Jeton] ${this.document.name}` : this.document.name;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    Object.assign(context, {
      actor: this.actor,
      document: this.actor,
      owner: this.actor.isOwner,
      limited: this.estLimitee,
      editable: this.isEditable,
      cssClass: this.isEditable ? "editable" : "locked",
      systemTemplate: game.system.template,
      isGM: game.user.isGM
    });
    this._donnees(context);
    context.enrichi = await enrichirChamps(this.actor, this.constructor.EDITEURS);
    return context;
  }

  /** Données propres à la fiche (anciennement getData) */
  _donnees(context) {
    context.personnalisations = this.actor.effects.filter(ef => ef.flags.noc?.personnalisation);
    context.perditionsEffects = this.actor.effects.filter(ef => ef.flags.noc?.perdition);
    this._preparePersonnageItems(context);
    this._preparePersonnageData(context);
  }

  _preparePersonnageData(context) {
    this.listQuantar(context);
  }

  _preparePersonnageItems(context) {
    this.checkArchetype();
    this.prepareArchetype(context);
    const gabarit = gabaritDe(this.actor);
    context.gabarit = gabarit ? { id: gabarit.id, nom: gabarit.name, resume: resumeGabarit(gabarit.system) } : null;
    context.sommeil = raisonSommeil(this.actor);
    context.documentsRecus = this.actor.type === "personnage" ? documentsRecus(this.actor).map(d => ({
      uuid: d.uuid, nom: d.name, titulaire: d.actor?.name ?? "", perime: !!validite(d)?.perime
    })) : [];
    context.cabales = (this.actor.cabalesActeurs ?? []).map(c => ({
      id: c.id, nom: c.name, bloc: c.system.bloc, coordonnes: c.system.coordonnes, societe: c.system.societeEcran
    }));
    const pts = Number(this.actor.system.progression) || 0;
    context.progressionHeros = {
      passage: passageOuvert(),
      peutDepenser: passageOuvert() && pts >= 3,
      regressions: Number(this.actor.system.regressionsDues) || 0
    };
    context.qualite = descriptionQualite(this.actor.system.qualites, "qualite");
    context.defaut = descriptionQualite(this.actor.system.defauts, "defaut");
  }

  /* -------------------------------------------- */
  /*  Rendu                                        */
  /* -------------------------------------------- */

  /** @override */
  async _preRender(context, options) {
    await super._preRender(context, options);
    memoriserDefilement(this);
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const html = this.element;
    activerOnglets(this, html, this.constructor.ONGLET_INITIAL);
    if (!this.estLimitee) {
      lierGlisser(this, html, this.constructor.GLISSABLES);
      this.activerEcouteurs(html);
    }
    restaurerDefilement(this);
  }

  /** Écouteurs de la fiche (anciennement activateListeners) */
  activerEcouteurs(html) {
    if (!this.isEditable) return;

    ecouter(html, ".item-create", this._onItemCreate.bind(this));
    ecouter(html, ".item-delete", ev => {
      ev.preventDefault();
      this.actor.items.get(ev.currentTarget.dataset.itemId)?.delete();
    });
    ecouter(html, ".item-open", ev => {
      ev.preventDefault();
      this.actor.items.get(ev.currentTarget.dataset.itemId)?.sheet.render(true);
    });
    ecouter(html, "li.item .img", ev => {
      ev.currentTarget.closest("li.item").classList.toggle("expanded");
      ev.stopPropagation();
    });

    // jets de Talent
    ecouter(html, ".roll-talent", ev => {
      ev.preventDefault();
      if (this.actor.type == "cabale") return;
      this.actor.rollTalent(ev.currentTarget.dataset.domaineId, ev.currentTarget.dataset.talentId);
    });
    // icône de quantar d'un objet : un clic l'équipe ou le libère
    ecouter(html, "img.needQuantar", this._onClickQuantarObjet.bind(this));
    ecouter(html, ".roll-item", ev => {
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      // objet usuel, document administratif, armure : le clic sur le nom ouvre sa fiche
      if (["objetusuel", "document administratif", "armure"].includes(item?.type)) return item.sheet.render(true);
      // outil : fenêtre d'attaque seulement s'il peut servir d'arme
      if (item?.type === "outil" && !outilUtilisableCommeArme(item)) return item.sheet.render(true);
      this.actor.rollItem(itemId);
    });

    ecouter(html, ".reserve input", this.changeReserve.bind(this));
    ecouter(html, ".reserve a.setMax", this.onClickMaxReserve.bind(this));
    ecouter(html, "a.unassignCabale", this.leaveCabale.bind(this));
    // progression : Passage (3 points), Régressions dues, historique
    ecouter(html, "a.progresser", () => depenserProgressionHeros(this.actor));
    ecouter(html, "a.appliquer-regression", () => appliquerRegression(this.actor));
    ecouter(html, "a.historique-progression", () => ouvrirHistorique(this.actor));
    // Fortune : transaction (bien ou service) ; le MJ signale ou lève un excès
    ecouter(html, "a.transaction-fortune", ev => { ev.preventDefault(); ev.stopPropagation(); transaction(this.actor); });
    ecouter(html, ".basculer-exces", ev => { ev.preventDefault(); ev.stopPropagation(); basculerExces(this.actor); });
    ecouter(html, "a.progression-plus", () => this.changerProgression(1));
    ecouter(html, "a.progression-moins", () => this.changerProgression(-1));
    ecouter(html, "a.quantars-plus", () => this.changerQuantars(1));
    ecouter(html, "a.quantars-moins", () => this.changerQuantars(-1));
    ecouter(html, "a.openCabale", this.openCabale.bind(this));

    ecouter(html, ".addQuality", this.addQuality.bind(this));
    ecouter(html, ".changerTheme", this.changerTheme.bind(this));
    ecouter(html, "a.guichet-bureau-bouton", () => ouvrirGuichet(this.actor));
    ecouter(html, "a.ouvrir-papier", ev => ouvrirPapier(ev.currentTarget.dataset.uuid));
    ecouter(html, "a.basculerJauges", this.basculerJauges.bind(this));
    ecouter(html, ".deleteQuality", this.deleteQuality.bind(this));

    ecouter(html, ".unassignContact", this.unassignContact.bind(this));
    ecouter(html, "#resetFaveurs", this._onResetFaveurs.bind(this));
    ecouter(html, ".contact i.createContact", this.createContact.bind(this));

    ecouter(html, ".deletePersonnalisation", this.deletePersonnalisation.bind(this));
    ecouter(html, ".delete-perdition-effect", this.deletePerditionEffect.bind(this));

    ecouter(html, ".talent-control a", this.updateTalent.bind(this));
    ecouter(html, ".domaine-control a", this.updateDomaine.bind(this));
    ecouter(html, ".delete-trait", this.deleteTrait.bind(this));
    ecouter(html, "a.add-trait", this.ajouterTrait.bind(this));
  }

  /* -------------------------------------------- */
  /*  Glisser-déposer                              */
  /* -------------------------------------------- */

  /** @override */
  _canDragStart(selector) { return this.isEditable; }

  /** @override */
  _canDragDrop(selector) { return this.isEditable; }

  /** @override */
  async _onDragStart(ev) {
    const el = ev.currentTarget;
    let donnees = null;
    if (el.classList.contains("quantarQty")) donnees = { type: "affectQuantar" };
    else if (el.classList.contains("quantarUsed")) donnees = { type: "unaffectQuantar", sourceItem: el.closest("li.item")?.dataset.itemId };
    else if (el.classList.contains("faveur")) donnees = { type: "affectFaveur" };
    else {
      const item = this.actor.items.get(el.closest("[data-item-id]")?.dataset.itemId);
      if (item) donnees = item.toDragData();
    }
    if (donnees) ev.dataTransfer.setData("text/plain", JSON.stringify(donnees));
  }

  /** @override */
  async _onDrop(event) {
    const data = donneesGlisser(event);
    if (!data) return;
    const allowed = Hooks.call("dropActorSheetData", this.actor, this, data);
    if (allowed === false) return;
    switch (data.type) {
      case "Actor": return this._nocDeposerActeur(event, data);
      case "Item": return this._nocDeposerObjet(event, data);
      case "affectQuantar": return this._onDropQuantar(event, data);
      case "unaffectQuantar": return this._onUnaffectQuantar(event, data);
      case "affectFaveur": return this.affectFaveur(event, data);
      default: return;
    }
  }

  async _nocDeposerActeur(ev, data) {
    const dropActor = await Actor.implementation.fromDropData(data);
    if (!dropActor) return false;
    if (!this.actor.isOwner) {
      ui.notifications.warn("Vous n'avez pas de droits sur ce personnage.");
      return false;
    }
    switch (dropActor.type) {
      case "cabale":
        if (!dropActor.isOwner) {
          ui.notifications.warn("Vous n'avez pas de droits sur cette cabale ; demandez à la Loi de l'affecter.");
          return false;
        }
        if (!ev.target.closest(".cabale")) return;
        return this.actor.setCabale(dropActor);
      case "personnage":
      case "rouage":
        // dépôt n'importe où dans la zone des contacts
        if (!ev.target.closest(".contacts")) return;
        return this.setContact(dropActor);
      default:
        return false;
    }
  }

  async _nocDeposerObjet(ev, data) {
    const dropItem = await Item.implementation.fromDropData(data);
    if (!dropItem) return false;
    // objet de cette fiche : tri
    if (dropItem.parent?.id === this.actor.id) return this._nocTrierObjet(ev, dropItem);
    if (dropItem.type == "thème") {
      return ui.notifications.warn("Les thèmes font maintenant partie des archétypes : glissez l'archétype sur la fiche, le thème sera proposé au choix.");
    }
    if (dropItem.type == "archetype") {
      if (!["personnage", "rouage"].includes(this.actor.type)) {
        return ui.notifications.warn("Les archétypes sont réservés aux personnages et aux rouages.");
      }
      return this._onDropArchetype(ev, dropItem);
    }
    if (dropItem.type == "gabarit") {
      if (!TYPES_GABARIT.includes(this.actor.type)) {
        return ui.notifications.warn("Les gabarits de corrompus se posent sur un personnage, un rouage, un Autre ou une créature.");
      }
      if (!this.actor.isOwner) return false;
      if (gabaritDe(this.actor)) {
        return ui.notifications.warn(`${this.actor.name} porte déjà un gabarit de corrompu. Supprimez-le d'abord si vous voulez en changer.`);
      }
    }
    // Personnage : un objet qui a une valeur s'achète (transaction) ou s'obtient sans achat
    if (this.actor.type === "personnage" && TYPES_ACHETABLES.includes(dropItem.type) && this.actor.isOwner) {
      const ajouter = await acquisitionObjet(this.actor, dropItem);
      if (!ajouter) return false;
    }
    if (!this.actor.isOwner) return false;
    const itemData = dropItem.toObject();
    delete itemData._id;
    return this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  /** Tri d'un objet de la fiche par rapport à l'objet sous le curseur */
  async _nocTrierObjet(ev, item) {
    if (typeof super._onSortItem === "function") return super._onSortItem(ev, item);
    const trier = foundry.utils.performIntegerSort ?? globalThis.SortingHelpers?.performIntegerSort;
    if (!trier) return;
    const cible = ev.target.closest("[data-item-id]");
    const voisin = this.actor.items.get(cible?.dataset.itemId);
    if (!voisin || voisin.id === item.id) return;
    const freres = this.actor.items.filter(i => i.type === item.type && i.id !== item.id);
    const maj = trier(item, { target: voisin, siblings: freres })
      .map(u => ({ _id: u.target.id, ...u.update }));
    return this.actor.updateEmbeddedDocuments("Item", maj);
  }

  async _onDropArchetype(ev, item) {
    if (!this.actor.isOwner) return false;
    if (this.actor.itemTypes.archetype.length) {
      return ui.notifications.warn("Ce personnage a déjà un archétype. Supprimez-le d'abord si vous voulez en changer.");
    }
    const itemData = item.toObject();
    delete itemData._id;
    itemData.effects = [];
    const themeId = await choisirTheme(itemData);
    if (themeId === null) return false; // fenêtre annulée
    foundry.utils.setProperty(itemData, "system.themeChoisi", themeId);
    return this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  async _onClickQuantarObjet(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const item = this.actor.items.get(ev.currentTarget.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    if (item.system.quantar) return item.update({ "system.quantar": false });
    const utilises = this.actor.items.filter(i => i.system.quantar).length;
    if (utilises >= (Number(this.actor.system.quantars) || 0)) {
      return ui.notifications.warn("Aucun quantar disponible : libérez-en un sur un autre objet ou augmentez le nombre de quantars possédés.");
    }
    return item.update({ "system.quantar": true });
  }

  async _onDropQuantar(ev, data) {
    const item = this.actor.items.get(ev.target.closest("li.item[data-item-id]")?.dataset.itemId);
    if (!item) return false;
    return item.update({ "system.quantar": true });
  }

  async _onUnaffectQuantar(ev, data) {
    const item = this.actor.items.get(data.sourceItem);
    if (item) return item.update({ "system.quantar": false });
  }

  async affectFaveur(ev, data) {
    const contactEl = ev.target.closest(".contact[data-contact-index]");
    if (!contactEl) return;
    const contactIndex = contactEl.dataset.contactIndex;
    const contactList = foundry.utils.deepClone(this.actor.system.contacts);
    if (!contactList[contactIndex]) return;
    // la réserve compte les jetons déjà distribués
    if ((this.actor.system.reserves.faveurs.value || 0) >= this.actor.system.reserves.faveurs.max) {
      return ui.notifications.warn(`${this.actor.name} n'a plus de faveur disponibles`);
    }
    // déposer un jeton sur un contact, c'est solliciter ce contact : le point est dépensé
    const contact = contactList[contactIndex];
    contact.faveurs = (Number(contact.faveurs) || 0) + 1;
    contact.usedFaveurs = (Number(contact.usedFaveurs) || 0) + 1;
    await this.actor.update({
      "system.contacts": contactList,
      "system.reserves.faveurs.value": this.actor.system.reserves.faveurs.value + 1
    });
    return this.annoncerFaveur(contact, Number(contactIndex));
  }

  /**
   * Message de chat d'une faveur sollicitée. Les jetons déposés à la suite sur le même
   * contact (moins de 2 minutes) mettent à jour le même message au lieu d'en créer un autre.
   */
  async annoncerFaveur(contact, contactIndex) {
    const total = Number(contact.usedFaveurs) || 0;
    const contenu = `<div class="nocRoll faveur-chat"><h4>${echapper(this.actor.name)} sollicite ${echapper(contact.nom)}</h4>
      <p><strong>${total} point${total > 1 ? "s" : ""} de faveur</strong> dépensé${total > 1 ? "s" : ""} auprès de ce contact pour ce scénario.</p></div>`;
    const dernier = game.messages.contents.at(-1);
    const repere = dernier?.flags?.noc?.faveur;
    if (repere && dernier.isAuthor && repere.acteur === this.actor.id && repere.contact === contactIndex
      && Date.now() - (dernier.timestamp ?? 0) < 120000) {
      return dernier.update({ content: contenu });
    }
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: contenu,
      flags: { noc: { faveur: { acteur: this.actor.id, contact: contactIndex } } }
    });
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  /** La Loi impose un trait : Traque, Noirceur ou trait libre */
  async ajouterTrait(ev) {
    ev.preventDefault();
    if (!game.user.isGM) return;
    const { NOC } = await import("../../helpers/config.mjs");
    const presents = new Set((this.actor.system.traits ?? []).map(t => t?.label));
    const groupes = { traque: "Traque", noirceur: "Noirceur" };
    const options = Object.entries(groupes).map(([g, titre]) => {
      const opts = Object.entries(NOC.traitsPerditions?.[g] ?? {}).filter(([, t]) => !presents.has(t.label))
        .map(([cle, t]) => `<option value="${g}.${cle}">${echapper(t.label)}</option>`).join("");
      return opts ? `<optgroup label="${titre}">${opts}</optgroup>` : "";
    }).join("");
    const valeurs = await formulaire(`Imposer un trait : ${this.actor.name}`, `
      <div class="form-group"><label>Trait</label><select name="trait">${options}<option value="libre">Autre trait (libre)…</option></select></div>
      <div class="form-group"><label>Nom <em>(trait libre)</em></label><input type="text" name="nom"></div>
      <div class="form-group"><label>Description <em>(trait libre)</em></label><textarea name="description" rows="3"></textarea></div>`,
      { valider: "Imposer", icone: "fas fa-plus" });
    if (!valeurs?.trait) return;
    let trait;
    if (valeurs.trait === "libre") {
      const nom = valeurs.nom?.trim();
      if (!nom) return ui.notifications.warn("Donnez un nom au trait.");
      trait = { label: nom, description: valeurs.description?.trim() ?? "" };
    } else {
      const [g, cle] = valeurs.trait.split(".");
      trait = foundry.utils.deepClone(NOC.traitsPerditions?.[g]?.[cle]);
    }
    if (!trait) return;
    let traits = [...(this.actor._source.system.traits ?? [])].filter(t => t?.label !== trait.label);
    // Ennemi public remplace Criminel
    if (trait.label === "ennemi public") traits = traits.filter(t => t?.label !== "criminel");
    traits.push(trait);
    await this.actor.update({ "system.traits": traits });
    return ChatMessage.create({
      whisper: game.users.filter(u => u.isGM || this.actor.testUserPermission(u, "OWNER")).map(u => u.id),
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="nocRoll"><h4>${echapper(this.actor.name)}</h4><p>Nouveau trait : <strong>${echapper(trait.label)}</strong>${trait.description ? ` — ${echapper(trait.description)}` : ""}</p></div>`
    });
  }

  async deleteTrait(ev) {
    await this.actor.removeTrait(ev.currentTarget.dataset.traitLabel);
  }

  async updateTalent(ev) {
    ev.preventDefault();
    const key = ev.currentTarget.closest(".talent-niveau").dataset.key;
    const [, , dom, tal] = key.split(".");
    // valeur de base (sans les bonus d'archétype et de thème)
    const value = Number(this.actor._source.system.talents[dom][tal].niveau) || 0;
    const ecart = ev.currentTarget.classList.contains("fa-add") ? 1 : -1;
    await this.actor.update({ [`system.talents.${dom}.${tal}.niveau`]: value + ecart });
  }

  async updateDomaine(ev) {
    ev.preventDefault();
    const key = ev.currentTarget.closest(".domaine-niveau").dataset.key;
    const dom = key.split(".")[2];
    const value = Number(this.actor._source.system.domaines[dom].value) || 0;
    const ecart = ev.currentTarget.classList.contains("fa-add") ? 1 : -1;
    await this.actor.update({ [`system.domaines.${dom}.value`]: value + ecart });
  }

  async deletePersonnalisation(ev) {
    await this.actor.effects.get(ev.currentTarget.dataset.effectId)?.delete();
  }

  async deletePerditionEffect(ev) {
    await this.actor.effects.get(ev.currentTarget.dataset.effectId)?.delete();
  }

  async createContact(ev) {
    const valeurs = await formulaire("Nouveau contact", `
      <div class="form-group"><label>Créer</label><select name="type">
        <option value="personnage">un personnage</option>
        <option value="rouage">un rouage</option>
      </select></div>
      <div class="form-group"><label>Nommé</label><input name="nom" type="text"></div>
      <div class="form-group"><label>Décrit comme</label><textarea name="description"></textarea></div>`);
    if (!valeurs?.nom) return;
    const newContact = await Actor.create({ name: valeurs.nom, type: valeurs.type, system: { description: valeurs.description } });
    return this.setContact(newContact);
  }

  async _onResetFaveurs(ev) {
    if (await confirmer("Réinitialiser les faveurs", "<p>Êtes-vous sûr de vouloir réinitialiser les faveurs ?</p>")) {
      return this.actor.resetContactFaveurs();
    }
  }

  async deleteQuality(ev) {
    const type = ev.currentTarget.dataset.type === "defaut" ? "defaut" : "qualite";
    await enregistrerQualite(this.actor, type, "");
  }

  checkArchetype() {
    if (this.actor.itemTypes.archetype?.length > 1) {
      ui.notifications.warn(`Le personnage ${this.actor.name.toUpperCase()} possède plusieurs archétypes : veuillez en supprimer.`);
    }
  }

  prepareArchetype(context) {
    const archetype = this.actor.itemTypes.archetype?.[0];
    const theme = archetype?.system.themes?.find(t => t.id === archetype.system.themeChoisi);
    context.themesDisponibles = (archetype?.system.themes?.length ?? 0) > 0;
    context.themeChoisi = theme ? {
      nom: theme.nom,
      detail: theme.talents.map(t => `${libelleTalent(t.talent)} ${t.value > 0 ? "+" : ""}${t.value}`).join(", ")
    } : null;
  }

  /** Rouage / Autre : toutes les jauges de perdition passent de 5 à 10 cases (ou l'inverse) */
  async basculerJauges(ev) {
    ev.preventDefault();
    const perditions = this.actor.system.perditions ?? {};
    const actuel = Math.max(...Object.values(perditions).map(p => Number(p.max) || 0));
    const max = actuel >= 10 ? 5 : 10;
    const maj = {};
    for (const [cle, p] of Object.entries(perditions)) {
      maj[`system.perditions.${cle}.max`] = max;
      if ((Number(p.value) || 0) > max) maj[`system.perditions.${cle}.value`] = max;
    }
    return this.actor.update(maj);
  }

  /** Changer de thème : les bonus suivent automatiquement le nouveau thème */
  async changerTheme(ev) {
    ev.preventDefault();
    const archetype = this.actor.itemTypes.archetype?.[0];
    if (!archetype) return;
    const themeId = await choisirTheme(archetype.toObject(), archetype.system.themeChoisi);
    if (!themeId || themeId === archetype.system.themeChoisi) return;
    return archetype.update({ "system.themeChoisi": themeId });
  }

  async addQuality(ev) {
    const type = ev.currentTarget.dataset.type === "defaut" ? "defaut" : "qualite";
    await choisirQualite(this.actor, type);
  }

  async onClickMaxReserve(ev) {
    ev.preventDefault();
    const reserveName = ev.currentTarget.dataset.reserveName;
    const max = ev.currentTarget.dataset.reserveProperty;
    const min = max.replace("max", "min");
    const valeurs = await formulaire(`Ajuster : ${reserveName}`, `
      <div class="form-group"><label>Valeur maximum</label><input type="number" name="max" value="${Number(foundry.utils.getProperty(this.actor._source, max)) || 10}"></div>
      <div class="form-group"><label>Valeur minimum</label><input type="number" name="min" value="${Number(foundry.utils.getProperty(this.actor._source, min)) || 0}"></div>`,
      { valider: "Modifier" });
    if (!valeurs) return;
    return this.actor.update({ [max]: parseInt(valeurs.max) || 0, [min]: parseInt(valeurs.min) || 0 });
  }

  changeReserve(ev) {
    let value = parseInt(ev.currentTarget.dataset.reserveValue) + 1;
    const property = ev.currentTarget.dataset.reserveProperty;
    const lastProp = property.split(".")[2];
    if (this.actor.system.energieNoire?.value == value || this.actor.system.reserves?.[lastProp]?.value == value || this.actor.system.perditions?.[lastProp]?.value == value) value -= 1;
    return this.actor.update({ [property]: value });
  }

  /** Nouvel objet du type indiqué (data-item-type) */
  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.itemType;
    if (!type) return;
    const libelle = game.i18n.localize(CONFIG.Item.typeLabels?.[type] ?? type);
    const [nouveau] = await this.actor.createEmbeddedDocuments("Item", [{ name: `${libelle} (indéfini)`, type }]);
    return nouveau?.sheet.render(true);
  }

  async changerQuantars(ecart) {
    const valeur = Math.max(0, (Number(this.actor._source.system.quantars) || 0) + ecart);
    return this.actor.update({ "system.quantars": valeur });
  }

  /** Correction manuelle du compteur (consignée dans l'historique) */
  async changerProgression(ecart) {
    return corrigerProgression(this.actor, ecart);
  }

  async openCabale(ev) {
    return game.actors.get(ev.currentTarget.dataset.cabaleId)?.sheet.render(true);
  }

  async leaveCabale(ev) {
    const cabaleId = ev.currentTarget.dataset.cabaleId;
    const cabale = game.actors.get(cabaleId);
    if (await confirmer(`Quitter la cabale : ${cabale?.name ?? "?"}`, "<p>Voulez-vous vraiment quitter cette cabale ?</p>")) {
      await this.actor.leaveCabale(cabaleId);
    }
  }

  async setContact(actor) {
    if (!actor || !["personnage", "rouage"].includes(actor.type)) return;
    if (actor.id === this.actor.id) return ui.notifications.warn("Un personnage ne peut pas être son propre contact.");
    const contactList = foundry.utils.deepClone(this.actor.system.contacts);
    if (contactList.some(c => c.id === actor.id)) return ui.notifications.info(`${actor.name} fait déjà partie des contacts.`);
    contactList.push({
      id: actor.id, uuid: actor.uuid, nom: actor.name, img: actor.img,
      description: actor.system.description ?? "", faveurs: 0, usedFaveurs: 0
    });
    await this.actor.update({ "system.contacts": contactList });
  }

  listQuantar(context) {
    const quantarUsage = this.actor.items.contents.map(i => i.toObject()).filter(it => it.system.quantar);
    const unused = (Number(this.actor.system.quantars) || 0) - quantarUsage.length;
    if (unused < 0) ui.notifications.error("Vous ne possédez pas assez de quantars pour vos objets.");
    for (let i = 0; i < unused; i++) quantarUsage.push({ unused: true });
    context.quantarUsage = quantarUsage;
  }

  async unassignContact(ev) {
    const contactIndex = ev.currentTarget.closest("div.contact").dataset.contactIndex;
    const contactList = foundry.utils.deepClone(this.actor.system.contacts);
    const removed = contactList[contactIndex];
    if (!removed) return;
    // les jetons non encore utilisés retournent dans la réserve
    const rendus = (removed.faveurs || 0) - (removed.usedFaveurs || 0);
    const newFav = Math.max(0, this.actor.system.reserves.faveurs.value - rendus);
    contactList.splice(contactIndex, 1);
    await this.actor.update({ "system.contacts": contactList, "system.reserves.faveurs.value": newFav });
  }
}
