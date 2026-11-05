import { NocFicheObjet } from "./fiche-objet.mjs";
import { ecouter } from "../v2-outils.mjs";

/** Fiche de thème, ancien format (ApplicationV2) */
export class nocItemSheetTheme extends NocFicheObjet {
  static DEFAULT_OPTIONS = { position: { width: 380, height: 380 } };
  static PARTS = { main: { template: "systems/noc/templates/item/sheet-thème.html" } };
  static COMPTEURS = false;

  /** Un thème posé sur un acteur n'est plus modifiable */
  get isEditable() {
    if (this.document.parent) return false;
    return super.isEditable;
  }

  activerEcouteurs(html) {
    const checks = html.querySelectorAll("a.talent-check");
    for (const check of checks) {
      const talent = check.dataset.domaine + "." + check.dataset.talent;
      const talObject = (this.item.system.talents ?? []).find(t => t.talent == talent);
      if (!talObject) continue;
      check.dataset.value = talObject.value;
      if (talObject.value === -1) { check.innerHTML = `<i class="fa-regular fa-square-minus"></i>`; check.dataset.tooltip = "-1"; }
      else if (talObject.value === 1) { check.innerHTML = `<i class="fa-regular fa-square-plus"></i>`; check.dataset.tooltip = "+1"; }
      else check.innerHTML = `<i class="fa-solid fa-square"></i>`;
    }
    if (!this.isEditable) return;
    ecouter(html, "a.talent-check", this.cycleTalent.bind(this));
  }

  async cycleTalent(ev) {
    ev.preventDefault();
    let val = Number(ev.currentTarget.dataset.value) || 0;
    val++;
    if (val > 1) val = -1;
    const tal = ev.currentTarget.dataset.domaine + "." + ev.currentTarget.dataset.talent;
    const talArray = foundry.utils.deepClone(this.item.system.talents ?? []);
    const obj = talArray.find(t => t.talent == tal);
    obj ? obj.value = val : talArray.push({ talent: tal, value: val });
    await this.item.update({ "system.talents": talArray });
  }
}
