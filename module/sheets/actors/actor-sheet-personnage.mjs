import { NocFicheActeur } from "./fiche-acteur.mjs";

/** Fiche de personnage (ApplicationV2) */
export class nocActorSheetPersonnage extends NocFicheActeur {
  static DEFAULT_OPTIONS = {
    classes: ["personnage"],
    position: { width: 850, height: 710 }
  };
  static MODELE = "systems/noc/templates/actor/actor-personnage-sheet.html";
  static ONGLET_INITIAL = "principal";
  static EDITEURS = ["system.implication", "system.couverture", "system.signalement", "system.description"];
  static PARTS = { main: { template: "systems/noc/templates/actor/actor-personnage-sheet.html" } };
}
