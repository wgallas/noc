import { contexteStratagemes } from "../../stratagemes.mjs";
import { NocFicheObjet } from "./fiche-objet.mjs";

/** Fiche d'outil (ApplicationV2) */
export class nocItemSheetOutil extends NocFicheObjet {
  static EDITEURS = ["system.description", "system.effetSpecial"];
  static PARTS = { main: { template: "systems/noc/templates/item/sheet-outil.html" } };

  async _donnees(context) {
    context.stratagemes = contexteStratagemes(this.item);
  }
}
