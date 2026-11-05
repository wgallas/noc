import { contexteStratagemes } from "../../stratagemes.mjs";
import { NocFicheObjet } from "./fiche-objet.mjs";

/** Fiche d'armure (ApplicationV2) */
export class nocItemSheetArmure extends NocFicheObjet {
  static PARTS = { main: { template: "systems/noc/templates/item/sheet-armure.html" } };

  async _donnees(context) {
    context.stratagemes = contexteStratagemes(this.item);
  }
}
