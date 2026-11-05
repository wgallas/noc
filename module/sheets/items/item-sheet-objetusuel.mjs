import { contexteStratagemes } from "../../stratagemes.mjs";
import { NocFicheObjet } from "./fiche-objet.mjs";

/** Fiche d'objet usuel (ApplicationV2) */
export class nocItemSheetObjetUsuel extends NocFicheObjet {
  static PARTS = { main: { template: "systems/noc/templates/item/sheet-objetusuel.html" } };

  async _donnees(context) {
    context.stratagemes = contexteStratagemes(this.item);
  }
}
