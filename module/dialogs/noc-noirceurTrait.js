import { NOC } from "../helpers/config.mjs";

/** Choix des traits de Noirceur (DialogV2) */
export class nocNoirceurTraits {

  /** Ouvre la fenêtre et ajoute au personnage les traits cochés */
  static async choisir(actor) {
    const traits = NOC.traitsPerditions.noirceur;
    const content = await foundry.applications.handlebars.renderTemplate('systems/noc/templates/window_app/noirceurTraits.hbs', { actor, traits });
    const choisis = await foundry.applications.api.DialogV2.wait({
      window: { title: "Traits de Noirceur" },
      classes: ["nocDialog"],
      position: { width: 420 },
      content,
      buttons: [
        {
          action: "valider", label: "Valider", icon: "fas fa-check", default: true,
          callback: (event, bouton) => [...bouton.form.querySelectorAll('input[data-trait-id]:checked')]
            .map(input => traits[input.dataset.traitId]).filter(Boolean)
        },
        { action: "annuler", label: "Annuler", icon: "fas fa-times" }
      ],
      rejectClose: false
    });
    if (!Array.isArray(choisis) || !choisis.length) return;
    await actor.update({ 'system.traits': (actor.system.traits ?? []).concat(choisis) });
  }
}
