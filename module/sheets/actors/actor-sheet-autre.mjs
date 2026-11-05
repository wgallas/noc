import { classeExo, energieNoireDeduite } from "../../autres.mjs";
import { NocFicheActeur } from "./fiche-acteur.mjs";
import { ecouter } from "../v2-outils.mjs";

/** Fiche d'Autre (ApplicationV2) */
export class nocActorSheetAutre extends NocFicheActeur {
  static DEFAULT_OPTIONS = {
    classes: ["autre"],
    position: { width: 600, height: 780 }
  };
  static MODELE = "systems/noc/templates/actor/actor-autre-sheet.html";
  static GLISSABLES = ".item-list .item";
  static PARTS = { main: { template: "systems/noc/templates/actor/actor-autre-sheet.html" } };

  activerEcouteurs(html) {
    super.activerEcouteurs(html);
    if (!this.isEditable) return;
    ecouter(html, "a.classe-exo-plus", () => this.changerClasseExo(1));
    ecouter(html, "a.classe-exo-moins", () => this.changerClasseExo(-1));
    ecouter(html, "a.energie-plus", () => this.forcerEnergieNoire(1));
    ecouter(html, "a.energie-moins", () => this.forcerEnergieNoire(-1));
    ecouter(html, "a.energie-auto", () => this.actor.update({ "system.energieNoire.forcee": null }));
  }

  /** Classe Exo entre 1 et 7 ; l'Énergie Noire déduite suit automatiquement */
  async changerClasseExo(ecart) {
    const valeur = classeExo((Number(this.actor._source.system.classeExo?.value) || 7) + ecart);
    return this.actor.update({ "system.classeExo.value": valeur });
  }

  /** Force l'Énergie Noire ; revient en automatique si elle rejoint la valeur déduite */
  async forcerEnergieNoire(ecart) {
    const valeur = Math.max(0, (Number(this.actor.system.energieNoire.value) || 0) + ecart);
    const deduite = energieNoireDeduite(this.actor._source.system.classeExo?.value);
    return this.actor.update({ "system.energieNoire.forcee": valeur === deduite ? null : valeur });
  }
}
