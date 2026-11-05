import { NocFicheActeur } from "./fiche-acteur.mjs";
import { ecouter } from "../v2-outils.mjs";

/** Fiche de créature (ApplicationV2) */
export class nocActorSheetCreature extends NocFicheActeur {
  static DEFAULT_OPTIONS = {
    classes: ["creature"],
    position: { width: 600, height: 780 }
  };
  static MODELE = "systems/noc/templates/actor/actor-creature-sheet.html";
  static GLISSABLES = ".item-list .item";
  static PARTS = { main: { template: "systems/noc/templates/actor/actor-creature-sheet.html" } };

  activerEcouteurs(html) {
    super.activerEcouteurs(html);
    ecouter(html, "a#roll-creature-attaque", () => this.actor.creatureAttaque());
  }
}
