import { activerCompteurs } from "../../armures.mjs";
import { domainesDuSysteme, libelleTalent, talentsDuSysteme } from "../../archetypes.mjs";
import { talentsGabarit } from "../../gabarits.mjs";

/** Fiche d'un gabarit de corrompu (livre de base p. 275) */
export class nocItemSheetGabarit extends foundry.appv1.sheets.ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["noc", "sheet", "item", "gabarit"],
      width: 520,
      height: 620
    });
  }

  /** @override */
  get template() {
    return "systems/noc/templates/item/sheet-gabarit.html";
  }

  /** @override */
  getData() {
    const context = super.getData();
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
    return context;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;
    activerCompteurs(html, this.item);
    html.find("select.gabarit-ajout-talent").change(ev => {
      const cle = ev.currentTarget.value;
      return this._modifierTalents(liste => { if (cle && !liste.some(t => t.talent === cle)) liste.push({ talent: cle, value: 1 }); });
    });
    html.find('[data-action="cycle-talent"]').click(ev => {
      const cle = ev.currentTarget.dataset.talent;
      return this._modifierTalents(liste => {
        const t = liste.find(x => x.talent === cle);
        if (t) t.value = t.value === 1 ? 2 : (t.value === 2 ? -1 : 1);
      });
    });
    html.find('[data-action="remove-talent"]').click(ev => {
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
