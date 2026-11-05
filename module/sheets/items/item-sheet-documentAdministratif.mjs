import {
  FORMULAIRES, ZONES_ACCES, ZONES_SORTIE, DUREES_SORTIE, MODES_REQUISITION, NUISANCES,
  calculerDocument, listeBeneficiaires, estDelivre, donneesPapier
} from "../../documents-administratifs.mjs";
import { presenterDocument, nomsPJ } from "../../bureau.mjs";
import { NocFicheObjet } from "./fiche-objet.mjs";
import { ecouter } from "../v2-outils.mjs";

export class nocItemSheetDocumentAdministratif extends NocFicheObjet {

  static DEFAULT_OPTIONS = { classes: ["document-administratif"], position: { width: 460, height: 760 } };
  static EDITEURS = ["system.description", "system.effetsDeBureau"];
  static PARTS = { main: { template: "systems/noc/templates/item/sheet-document administratif.html" } };
  /** boutons +/- propres (data-min) */
  static COMPTEURS = false;

  async _donnees(context) {
    context.calc = calculerDocument(this.item);
    context.formulaires = Object.fromEntries(Object.entries(FORMULAIRES).map(([k, f]) => [k, f.label]));
    context.descriptionFormulaire = FORMULAIRES[context.calc.type].description;
    context.zonesAcces = ZONES_ACCES;
    context.zonesSortie = ZONES_SORTIE;
    context.dureesSortie = Object.fromEntries(Object.entries(DUREES_SORTIE).map(([k, d]) => [k, d.label]));
    context.modesRequisition = MODES_REQUISITION;
    context.nuisances = NUISANCES;
    context.beneficiaires = context.calc.beneficiaires.map((nom, index) => ({ nom, index, numero: index + 1, supprimable: index >= 2 }));
    const s = this.item.system;
    context.s = s;
    context.pjs = nomsPJ();
    context.isGM = game.user.isGM;
    // Affichage « papier » :
    // - document délivré par le guichet : verrouillé (seul le MJ peut le déverrouiller) ;
    // - autre document dans un inventaire : papier par défaut, bouton Modifier pour passer en édition ;
    // - document hors inventaire (onglet Objets, compendium) : édition par défaut, bouton Voir le papier.
    const delivre = estDelivre(this.item);
    const edition = this._edition ?? !this.item.actor;
    context.delivre = delivre;
    context.verrouille = delivre ? !s.deverrouille : !edition;
    context.delivreDeverrouille = delivre && s.deverrouille;
    context.basculable = !delivre;
    context.papier = donneesPapier(this.item);
    // durée permanente : seulement depuis la fiche de l'objet (pas depuis le guichet)
    context.permanentPossible = true;
    context.choix = {
      formulaire: context.calc.type,
      zoneAcces: String(s.acces?.zone ?? 1),
      zoneSortie: String(s.sortie?.zone ?? 3),
      dureeSortie: s.sortie?.duree || "formulaire",
      modeRequisition: s.requisition?.mode || "objet"
    };
  }

  activerEcouteurs(html) {
    ecouter(html, "a.presenter-document", () => presenterDocument(this.item));
    ecouter(html, "a.basculer-edition", () => {
      this._edition = !(this._edition ?? !this.item.actor);
      this.render();
    });
    if (game.user.isGM) {
      ecouter(html, "a.deverrouiller-document", () => this.item.update({ "system.deverrouille": true }));
      ecouter(html, "a.reverrouiller-document", () => this.item.update({ "system.deverrouille": false }));
    }
    if (!this.isEditable) return;

    // boutons +/- : data-champ = chemin, data-min = minimum (0 par défaut)
    ecouter(html, "a.compteur-plus", ev => this._changer(ev.currentTarget, 1));
    ecouter(html, "a.compteur-moins", ev => this._changer(ev.currentTarget, -1));

    // bénéficiaires : la liste est enregistrée en entier
    ecouter(html, "input.beneficiaire", ev => {
      ev.stopPropagation();
      const liste = listeBeneficiaires(this.item.system);
      liste[Number(ev.currentTarget.dataset.index)] = ev.currentTarget.value;
      this.item.update({ "system.beneficiaires": liste });
    }, "change");
    ecouter(html, "a.ajouter-beneficiaire", () => {
      const liste = listeBeneficiaires(this.item.system);
      liste.push("");
      this.item.update({ "system.beneficiaires": liste });
    });
    ecouter(html, "a.retirer-beneficiaire", ev => {
      const liste = listeBeneficiaires(this.item.system);
      liste.splice(Number(ev.currentTarget.dataset.index), 1);
      this.item.update({ "system.beneficiaires": liste });
    });
  }

  async _changer(lien, ecart) {
    const champ = lien.dataset.champ;
    const min = Number(lien.dataset.min ?? 0);
    const actuel = Number(foundry.utils.getProperty(this.item._source, champ));
    const base = Number.isFinite(actuel) ? actuel : min;
    return this.item.update({ [champ]: Math.max(min, base + ecart) });
  }

}
