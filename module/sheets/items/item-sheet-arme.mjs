import { contexteStratagemes } from "../../stratagemes.mjs";
import { TRAITS_ARMES } from "../../armes.mjs";
import { NocFicheObjet } from "./fiche-objet.mjs";
import { ecouter } from "../v2-outils.mjs";

/** Fiche d'arme (ApplicationV2) */
export class nocItemSheetArme extends NocFicheObjet {
  static DEFAULT_OPTIONS = { position: { width: 440, height: 760 } };
  static PARTS = { main: { template: "systems/noc/templates/item/sheet-arme.html" } };

  async _donnees(context) {
    context.stratagemes = contexteStratagemes(this.item);
    const traits = this.item.system.traitsArme ?? {};
    context.traitsSimples = [];
    context.traitsChiffres = [];
    for (const [cle, def] of Object.entries(TRAITS_ARMES)) {
      const t = traits[cle];
      const ligne = { cle, label: def.label, description: def.description };
      if (def.chiffre) context.traitsChiffres.push({ ...ligne, actif: !!t?.actif, valeur: Number(t?.valeur) || 0 });
      else context.traitsSimples.push({ ...ligne, actif: !!t });
    }
  }

  activerEcouteurs(html) {
    if (!this.isEditable) return;
    // Contact / Distance
    ecouter(html, "select.type-arme", ev => {
      ev.stopPropagation();
      return this.item.update({ "system.adistance": ev.currentTarget.value === "distance" });
    }, "change");
  }
}
