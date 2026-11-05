import { NocFicheActeur } from "./fiche-acteur.mjs";

/** Fiche de rouage (ApplicationV2) */
export class nocActorSheetRouage extends NocFicheActeur {
  static DEFAULT_OPTIONS = {
    classes: ["rouage"],
    position: { width: 600, height: 780 }
  };
  static MODELE = "systems/noc/templates/actor/actor-rouage-sheet.html";
  static GLISSABLES = ".item-list .item";
  static PARTS = { main: { template: "systems/noc/templates/actor/actor-rouage-sheet.html" } };
}
