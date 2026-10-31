/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  return foundry.applications.handlebars.loadTemplates([

    // Actor partials.
    "systems/noc/templates/actor/parts/actor-features.html",
    "systems/noc/templates/actor/parts/actor-items.html",
    "systems/noc/templates/actor/parts/actor-talents.html",
    "systems/noc/templates/actor/parts/gabarit.hbs",
    "systems/noc/templates/item/parts/stratagemes.hbs",
    "systems/noc/templates/item/parts/document-options.hbs",
    "systems/noc/templates/item/parts/document-bilan.hbs",
    "systems/noc/templates/item/parts/document-papier.hbs",
  ]);
};
