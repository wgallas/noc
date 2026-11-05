import { creerTheme, libelleTalent, talentsDuSysteme, themeDepuisItem } from "../../archetypes.mjs";
import { NocFicheObjet } from "./fiche-objet.mjs";
import { confirmer, donneesGlisser, ecouter } from "../v2-outils.mjs";

export class nocItemSheetArchetype extends NocFicheObjet {

  static DEFAULT_OPTIONS = { position: { width: 750, height: 650 } };
  static PARTS = { main: { template: "systems/noc/templates/item/sheet-archetype.html" } };
  static COMPTEURS = false;

  /** Un archétype déjà posé sur un personnage n'est plus modifiable */
  get isEditable() {
    if (this.document.parent) return false;
    return super.isEditable;
  }

  async _donnees(context) {
    // Talents mineurs : structure complète si l'archétype est vide
    context.talentsMineurs = this.item.system.talentsMineurs?.erudition
      ? this.item.system.talentsMineurs : foundry.utils.deepClone(game.system.template.Actor.rouage.talents);
    context.themes = (this.item.system.themes ?? []).map(t => ({
      ...t,
      choisi: t.id === this.item.system.themeChoisi,
      talents: t.talents.map(x => ({
        ...x,
        label: libelleTalent(x.talent),
        signe: x.value > 0 ? `+${x.value}` : `${x.value}`
      }))
    }));
    context.listeTalents = Object.entries(talentsDuSysteme()).map(([dom, talents]) => ({
      domaine: dom,
      talents: Object.entries(talents).map(([tal, t]) => ({ cle: `${dom}.${tal}`, label: t.label }))
    }));
  }

  /* -------------------------------------------- */

  activerEcouteurs(html) {
    const mineurs = this.item.system.talentsMineurs ?? {};
    for (const check of html.querySelectorAll("a.talent-check")) {
      const talObject = mineurs[check.dataset.domaine]?.[check.dataset.talent];
      if (!talObject) continue;
      check.dataset.value = talObject.niveau;
      switch (Number(talObject.niveau)) {
        case -1:
          check.innerHTML = `<i class="fa-regular fa-square-minus"></i>`;
          check.dataset.tooltip = "-1";
          break;
        case 1:
          check.innerHTML = `<i class="fa-regular fa-square-plus"></i>`;
          check.dataset.tooltip = "+1";
          break;
        default:
          check.innerHTML = `<i class="fa-solid fa-square"></i>`;
      }
    }

    // Tout ce qui suit n'est utile que si la fiche est modifiable
    if (!this.isEditable) return;

    ecouter(html, "a.talent-check", this.cycleTalent.bind(this));
    // glisser un ancien objet « thème » sur la zone des thèmes
    for (const zone of html.querySelectorAll(".archetype-themes")) {
      zone.addEventListener("dragover", ev => ev.preventDefault());
      zone.addEventListener("drop", ev => this._deposerTheme(ev));
    }

    // Thèmes
    ecouter(html, '[data-action="add-theme"]', this.ajouterTheme.bind(this));
    ecouter(html, '[data-action="delete-theme"]', this.supprimerTheme.bind(this));
    ecouter(html, '[data-action="remove-theme-talent"]', this.retirerTalentTheme.bind(this));
    ecouter(html, '[data-action="cycle-theme-talent"]', this.cyclerTalentTheme.bind(this));
    ecouter(html, "input.theme-nom", ev => this.modifierTheme(ev, t => { t.nom = ev.currentTarget.value.trim() || t.nom; }), "change");
    ecouter(html, "textarea.theme-description", ev => this.modifierTheme(ev, t => { t.description = ev.currentTarget.value; }), "change");
    ecouter(html, "select.theme-ajout-talent", ev => this.modifierTheme(ev, t => {
      const cle = ev.currentTarget.value;
      if (!cle || t.talents.some(x => x.talent === cle)) return;
      t.talents.push({ talent: cle, value: 1 });
    }), "change");
  }

  async cycleTalent(ev) {
    ev.preventDefault();
    let val = Number(ev.currentTarget.dataset.value) || 0;
    val++;
    if (val > 1) { val = -1 };
    ev.currentTarget.dataset.value = val;

    let talentsMineurs = foundry.utils.deepClone(this.item.system.talentsMineurs?.erudition
      ? this.item.system.talentsMineurs : game.system.template.Actor.rouage.talents)
    let dom = ev.currentTarget.dataset.domaine
    let tal = ev.currentTarget.dataset.talent

    talentsMineurs[dom][tal].niveau = val

    await this.item.update({
      "system.talentsMineurs": talentsMineurs
    });
  }

  /* -------------------------------------------- */
  /*  Gestion des thèmes                          */
  /* -------------------------------------------- */

  _themes() {
    return foundry.utils.deepClone(this.item.system.themes ?? []);
  }

  async _enregistrerThemes(themes) {
    return this.item.update({ "system.themes": themes });
  }

  async modifierTheme(ev, modification) {
    ev.preventDefault();
    ev.stopPropagation();
    const id = ev.currentTarget.closest("[data-theme-id]")?.dataset.themeId;
    const themes = this._themes();
    const theme = themes.find(t => t.id === id);
    if (!theme) return;
    modification(theme);
    return this._enregistrerThemes(themes);
  }

  async ajouterTheme(ev) {
    ev.preventDefault();
    const themes = this._themes();
    themes.push(creerTheme({ nom: "Nouveau thème" }));
    return this._enregistrerThemes(themes);
  }

  async supprimerTheme(ev) {
    ev.preventDefault();
    const id = ev.currentTarget.closest("[data-theme-id]")?.dataset.themeId;
    const themes = this._themes();
    const theme = themes.find(t => t.id === id);
    if (!theme) return;
    const ok = await confirmer("Supprimer un thème", `<p>Supprimer le thème « ${theme.nom} » de cet archétype ?</p>`);
    if (!ok) return;
    return this._enregistrerThemes(themes.filter(t => t.id !== id));
  }

  async retirerTalentTheme(ev) {
    const cle = ev.currentTarget.dataset.talent;
    return this.modifierTheme(ev, t => { t.talents = t.talents.filter(x => x.talent !== cle) });
  }

  /** Clic sur la valeur d'un talent : +1 → +2 → -1 → +1 */
  async cyclerTalentTheme(ev) {
    const cle = ev.currentTarget.dataset.talent;
    return this.modifierTheme(ev, t => {
      const x = t.talents.find(x => x.talent === cle);
      if (x) x.value = x.value === 1 ? 2 : (x.value === 2 ? -1 : 1);
    });
  }

  /* -------------------------------------------- */
  /*  Glisser un ancien objet « thème »            */
  /* -------------------------------------------- */

  async _deposerTheme(event) {
    event.preventDefault();
    event.stopPropagation();
    const data = donneesGlisser(event);
    if (data?.type !== "Item") return false;
    const droppedItem = await fromUuid(data.uuid);
    if (droppedItem?.type !== "thème") return false;
    const themes = this._themes();
    themes.push(themeDepuisItem(droppedItem));
    return this._enregistrerThemes(themes);
  }
}
