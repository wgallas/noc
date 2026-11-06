/**
 * Fiche d'objet ApplicationV2 commune. Chaque type a sa sous-classe (modèle,
 * taille, données et écouteurs propres).
 */
import { activerCompteursV2, activerOnglets, changerImage, enrichirChamps, memoriserDefilement, restaurerDefilement } from "../v2-outils.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class NocFicheObjet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["noc", "sheet", "item"],
    position: { width: 300, height: 580 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: function (event, cible) { return changerImage(this, cible); }
    }
  };

  /** Champs de texte riche de la fiche */
  static EDITEURS = ["system.description"];
  /** Boutons +/- génériques (data-champ) gérés par la base */
  static COMPTEURS = true;

  static PARTS = {
    main: { template: "systems/noc/templates/item/sheet-objetusuel.html" }
  };

  /** Titre de la fenêtre : le nom de l'objet seul (comme les anciennes fiches) */
  get title() {
    return this.document.name;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    Object.assign(context, {
      item: this.item,
      document: this.item,
      owner: this.item.isOwner,
      editable: this.isEditable,
      cssClass: this.isEditable ? "editable" : "locked",
      systemTemplate: game.system.template,
      isGM: game.user.isGM
    });
    await this._donnees(context);
    context.enrichi = await enrichirChamps(this.item, this.constructor.EDITEURS);
    return context;
  }

  /** Données propres au type d'objet (anciennement getData) */
  async _donnees(context) {}

  /** @override */
  async _preRender(context, options) {
    await super._preRender(context, options);
    memoriserDefilement(this);
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const html = this.element;
    activerOnglets(this, html, "description");
    if (this.isEditable && this.constructor.COMPTEURS) activerCompteursV2(html, this.item);
    this.activerEcouteurs(html);
    restaurerDefilement(this);
  }

  /** Écouteurs propres au type d'objet (anciennement activateListeners) */
  activerEcouteurs(html) {}
}
