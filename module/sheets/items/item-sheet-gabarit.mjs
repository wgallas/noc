import { NocFicheObjet } from "./fiche-objet.mjs";
import { ecouter } from "../v2-outils.mjs";
import { domainesDuSysteme, libelleTalent, talentsDuSysteme } from "../../archetypes.mjs";
import { talentsGabarit } from "../../gabarits.mjs";

/** Fiche d'un gabarit de corrompu (livre de base p. 275) */
export class nocItemSheetGabarit extends NocFicheObjet {

  static DEFAULT_OPTIONS = { classes: ["gabarit"], position: { width: 520, height: 620 } };
  static PARTS = { main: { template: "systems/noc/templates/item/sheet-gabarit.html" } };

  async _donnees(context) {
    const s = this.item.system;
    context.domaines = Object.entries(domainesDuSysteme()).map(([cle, d]) => ({
      cle, label: d.label ?? cle, valeur: Number(s.domaines?.[cle]) || 0
    }));
    context.talents = talentsGabarit(s).map(t => ({
      ...t, label: libelleTalent(t.talent), signe: t.value > 0 ? `+${t.value}` : `${t.value}`
    }));
    context.listeTalents = Object.entries(talentsDuSysteme()).map(([dom, talents]) => ({
      domaine: dom,
      talents: Object.entries(talents).map(([tal, t]) => ({ cle: `${dom}.${tal}`, label: t.label }))
    }));
  }

  activerEcouteurs(html) {
    if (!this.isEditable) return;
    ecouter(html, "select.gabarit-ajout-talent", ev => {
      const cle = ev.currentTarget.value;
      ev.stopPropagation();
      return this._modifierTalents(liste => { if (cle && !liste.some(t => t.talent === cle)) liste.push({ talent: cle, value: 1 }); });
    }, "change");
    ecouter(html, '[data-action="cycle-talent"]', ev => {
      const cle = ev.currentTarget.dataset.talent;
      return this._modifierTalents(liste => {
        const t = liste.find(x => x.talent === cle);
        if (t) t.value = t.value === 1 ? 2 : (t.value === 2 ? -1 : 1);
      });
    });
    ecouter(html, '[data-action="remove-talent"]', ev => {
      const cle = ev.currentTarget.dataset.talent;
      return this._modifierTalents(liste => liste.splice(0, liste.length, ...liste.filter(x => x.talent !== cle)));
    });
  }

  async _modifierTalents(modification) {
    const liste = talentsGabarit(this.item.system);
    modification(liste);
    return this.item.update({ "system.talents": liste });
  }
}
