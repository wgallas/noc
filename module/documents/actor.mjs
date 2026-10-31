import NOCContact from "../ContactClass.js";
import { nocRollDialog } from "../dialogs/roll-dialog.js";
import { NOC } from "../helpers/config.mjs";
import { Quality } from "../qualite_default.mjs";
import { nocNoirceurTraits } from '../dialogs/noc-noirceurTrait.js';
import { appliquerArchetype } from "../archetypes.mjs";
import { appliquerQualites } from "../qualites.mjs";
import { appliquerAutre } from "../autres.mjs";
import { appliquerGabarit, armeAvecGabarit } from "../gabarits.mjs";
import { estRouageHostile } from "../fiel/gouttes.mjs";
import { armeAvecStratagemes, bonusEquipementTalent, outilUtilisableCommeArme } from "../stratagemes.mjs";
import { appliquerArmures } from "../armures.mjs";
import { appliquerEtats } from "../panneau-mj.mjs";
import { jetonParDefaut } from "../jetons.mjs";
import { appliquerPerditions, appliquerFolieTranscendante, valeursAvant, seuilsFranchis } from "../perditions.mjs";
import { appliquerEffetsFiel, aggravationsActives } from "../fiel/bibliotheque.mjs";
import { preparerCabale, cabalesPourJet, seuilsCabale, divisionDuPersonnage } from "../cabale.mjs";
import { assistantCreation } from "../cabale-gestion.mjs";
/**
 * Taille d'une réserve selon le niveau du Talent qui la commande
 * (livre de base p. 260 ; Contacts niveau 5 : 10 Faveurs, p. 241).
 * Au-delà du dernier palier, la taille reste celle du palier le plus haut.
 */
const PALIERS_RESERVES = {
  singularite: [0, 0, 2, 3, 4, 5],     // Artefact -1, 0, 1, 2, 3, 4 et plus
  espoir: [1, 3, 5, 7, 9, 10],         // Ferveur -1, 0, 1, 2, 3, 4 et plus
  faveurs: [0, 0, 2, 4, 6, 8, 10]      // Contacts -1, 0, 1, 2, 3, 4, 5 et plus
};
export function tailleReserve(reserve, niveau) {
  const paliers = PALIERS_RESERVES[reserve];
  const n = Math.round(Number(niveau) || 0);
  const i = Math.min(paliers.length - 1, Math.max(0, n + 1));
  return paliers[i];
}

/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class nocActor extends Actor {

  constructor(...args) {
    let data = args[0];


    if (!data.img) {
      switch (data.type) {
        case "personnage":
        case "rouage":
          data.img = 'systems/noc/asset/default_icons/personnage.webp';
          break;
        case "cabale":
          data.img = 'systems/noc/asset/default_icons/cabale.webp';
          break;
        case "autre":
          data.img = 'systems/noc/asset/default_icons/autre.webp';
          break;
        default:
          data.img = 'systems/noc/asset/default_icons/question_mark.webp';
          break;

      }
    };

    super(...args);

    // Les valeurs initiales des rouages et cabales sont appliquées une seule fois,
    // à la création (voir _preCreate), et non plus à chaque chargement.

  }

  /** Valeurs par défaut appliquées à la création d'un nouvel acteur */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;

    // Jeton rond, dessin qui ne tourne pas avec le déplacement
    this.updateSource(jetonParDefaut());

    // Nouveau rouage : tous les domaines à 2 (sauf valeur déjà fournie,
    // par exemple lors d'une importation ou d'une copie)
    // Nouvel Autre : jauges de perdition à 5 cases, comme sur sa fiche
    if (this.type === "autre") {
      const updates = {};
      for (const perd of Object.keys(this.system.perditions ?? {})) {
        if (foundry.utils.getProperty(data, `system.perditions.${perd}.max`) === undefined) updates[`system.perditions.${perd}.max`] = 5;
      }
      if (Object.keys(updates).length) this.updateSource(updates);
    }
    if (this.type === "rouage") {
      const updates = {};
      for (const domaine of Object.keys(this.system.domaines ?? {})) {
        if (foundry.utils.getProperty(data, `system.domaines.${domaine}.value`) === undefined) {
          updates[`system.domaines.${domaine}.value`] = 2;
        }
      }
      // Réserves et perditions de départ d'un rouage
      const defaut = (chemin, valeur) => {
        if (foundry.utils.getProperty(data, chemin) === undefined) updates[chemin] = valeur;
      };
      for (const perd of Object.keys(this.system.perditions ?? {})) {
        defaut(`system.perditions.${perd}.max`, 5);
        defaut(`system.perditions.${perd}.value`, 0);
      }
      defaut("system.reserves.vecu.max", 5);
      defaut("system.reserves.vecu.value", 1);
      defaut("system.reserves.espoir.max", 5);
      defaut("system.reserves.espoir.value", 1);
      if (Object.keys(updates).length) this.updateSource(updates);
    }

    // Nouvelle cabale : noms propres de ses perditions
    if (this.type === "cabale") {
      const noms = { blessures: "dégradation", traque: "traque", noirceur: "noirceur", trauma: "division" };
      const updates = {};
      for (const [perd, label] of Object.entries(noms)) {
        if (foundry.utils.getProperty(data, `system.perditions.${perd}.label`) === undefined) {
          updates[`system.perditions.${perd}.label`] = label;
        }
      }
      if (Object.keys(updates).length) this.updateSource(updates);
    }
  }

  /** Nouvelle cabale vierge : l'assistant de création s'ouvre pour celui qui l'a créée */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (this.type !== "cabale" || userId !== game.user.id) return;
    const vierge = !this.system.archetype && Object.values(this._source.system.talents ?? {})
      .every(liste => Object.values(liste ?? {}).every(t => !Number(t.niveau)));
    if (vierge) setTimeout(() => assistantCreation(this), 400);
  }

  /** Effets de Fiel « aggravants » : un héros qui subit au moins 1 point en reçoit 1 de plus */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if (allowed === false) return false;
    // nouvelle perte dans une jauge : le personnage peut de nouveau être soigné / apaisé / purifié
    for (const [cle, p] of Object.entries(changed.system?.perditions ?? {})) {
      if (p?.value === undefined) continue;
      if (Number(p.value) > (Number(this._source.system?.perditions?.[cle]?.value) || 0)) {
        foundry.utils.setProperty(changed, `flags.noc.soins.${cle}`, 0);
      }
    }
    if (this.type === "cabale") {
      if (foundry.utils.hasProperty(changed, "system.perditions")) options.nocCabaleAvant = valeursAvant(this);
      // Dégradation entièrement réparée : les Fortifications retrouvent tout leur niveau
      const degradation = foundry.utils.getProperty(changed, "system.perditions.blessures.value");
      if (degradation !== undefined && Number(degradation) <= (Number(this._source.system.perditions?.blessures?.min) || 0)) {
        foundry.utils.setProperty(changed, "system.depenses.fortifications", 0);
      }
      return;
    }
    if (this.type !== "personnage") return;
    // valeurs des jauges avant modification : seuils franchis traités après la mise à jour
    if (foundry.utils.hasProperty(changed, "system.perditions")) options.nocPerditionsAvant = valeursAvant(this);
    const aggravations = aggravationsActives();
    const aggravees = [];
    for (const cle of Object.keys(aggravations)) {
      const nouvelle = foundry.utils.getProperty(changed, `system.perditions.${cle}.value`);
      if (nouvelle === undefined) continue;
      const p = this._source.system.perditions?.[cle];
      if (!p || Number(nouvelle) <= (Number(p.value) || 0)) continue;
      foundry.utils.setProperty(changed, `system.perditions.${cle}.value`, Math.min(Number(p.max) || 10, Number(nouvelle) + 1));
      aggravees.push(p.label ?? cle);
    }
    if (aggravees.length) ui.notifications.info(`${this.name} : effet de Fiel, +1 en ${aggravees.join(", ")}.`);
  }

  async _onUpdate(update, options, user) {
    if (user == game.user._id && this.type == "personnage" && options.nocPerditionsAvant) {
      await seuilsFranchis(this, options.nocPerditionsAvant);
    }
    if (user == game.user._id && this.type == "cabale" && options.nocCabaleAvant) {
      await seuilsCabale(this, options.nocCabaleAvant);
    }

    super._onUpdate(update, options, user);

  }
  async initRouage(data) {

    for (let perd in this.system.perditions) {
      this.system.perditions[perd].max = 5;
      this.system.perditions[perd].value = 0;
    }
    this.system.reserves.vecu.max = 5;
    this.system.reserves.vecu.value = 1;
    this.system.reserves.espoir.max = 5;
    this.system.reserves.espoir.value = 1;



  }
  async initCabale() {
    if (this.id) {
      await this.update({
        "system.perditions": {
          "blessures": {
            "label": "dégradation",
            "value": 0,
            "min": 0,
            "max": 10
          },
          "traque": {
            "label": "traque",
            "value": 0,
            "min": 0,
            "max": 10
          },
          "noirceur": {
            "label": "noirceur",
            "value": 0,
            "min": 0,
            "max": 10
          },
          "trauma": {
            "label": "division",
            "value": 0,
            "min": 0,
            "max": 10
          }
        }
      })
    }
  }


  /**
   * @override
   * Augment the basic actor data with additional dynamic data. Typically,
   * you'll want to handle most of your calculated/derived data in this step.
   * Data calculated in this step should generally not exist in template.json
   * (such as ability modifiers rather than ability scores) and should be
   * available both inside and outside of character sheets (such as if an actor
   * is queried and has a roll executed directly from it).
   */
  prepareDerivedData() {

    // Bonus de l'archétype et du thème choisi (avant les calculs qui en dépendent)
    appliquerArchetype(this);
    appliquerQualites(this);
    appliquerAutre(this);
    // Gabarit de corrompu : par-dessus l'archétype et l'Énergie noire
    appliquerGabarit(this);
    appliquerArmures(this);
    appliquerEtats(this);
    appliquerPerditions(this);
    appliquerEffetsFiel(this);
    // Folie 6 ou plus et Trauma 3 ou plus : +1 à tous les Domaines (niveau de Folie effectif)
    appliquerFolieTranscendante(this);
    preparerCabale(this);

    this._preparePersonnageData();
    this._prepareRouageData();
    this._prepareAutreData();

    // Make separate methods for each Actor type (character, npc, etc.) to keep
    // things organized.

  }
  getQuality() {
    return Quality.create(this.system.qualites)
  }
  getDefault() {
    return Quality.create(this.system.defauts)
  }
  /**
   * Prepare Character type specific data
   */
  async _preparePersonnageData() {
    if (this.type !== 'personnage') return;

    // Taille des réserves selon le niveau du Talent (livre de base p. 260 :
    // le niveau 4 vaut pour 4 ou plus ; Contacts 5 et plus : 10 Faveurs, p. 241)
    const r = this.system.reserves;
    r.singularite.max = tailleReserve("singularite", this.system.talents.technique.artefact.niveau);
    r.espoir.max = tailleReserve("espoir", this.system.talents.vie.ferveur.niveau);
    // preparing contacts
    this.prepareContacts();

  }

  /**
   * Prepare NPC type specific data.
   */
  _prepareRouageData(actorData) {
    if (this.type !== 'rouage') return;


  }
  _prepareAutreData() {
    if (this.type !== 'autre') return;

    // Classe Exo, Énergie Noire, domaines et talents : voir module/autres.mjs (appliqué plus haut)

  }
  prepareContacts() {
    // Nombre de contacts illimité : on ne garde que les vrais contacts
    // (les anciens emplacements "vide" sont ignorés).
    let contacts = Array.isArray(this.system.contacts) ? this.system.contacts : [];
    contacts = contacts.filter(c => c && typeof c === "object");

    // Les jetons de faveur, eux, restent limités par le talent Contacts.
    const faveur = tailleReserve("faveurs", this.system.talents.statut.contact.niveau);

    this.system.contacts = contacts;
    this.system.reserves.faveurs.max = faveur;
  };
  async checkPerditions(update) {
    for (let perd in update.system.perditions) {

      if (update.system.perditions[perd].value) {

        let perdition = Object.getOwnPropertyNames(update.system.perditions)[0]
        let newVal = update.system.perditions[perd].value
        let relevantStep = NOC.compteur2Step[newVal] // Get the relevant step value
        let perditionStep = NOC.effetsPerditions[perd][relevantStep] // Get the perdition data
        // clearing effects
        if (perditionStep) {
          if (perditionStep.deleteEffects) {
            let toDelete = []
            for (let flag of perditionStep.deleteEffects) {
              let effect = this.effects.find(effect => effect.getFlag("world", flag))
              if (effect) {
                toDelete.push(effect.id)
              }
            }
            await this.deleteEmbeddedDocuments("ActiveEffect", toDelete)
          };

          // Update status
          this.update({ [`system.perditions.${perdition}.statut`]: { label: perditionStep.label, description: perditionStep.description } })

          // Effect ?
          let effect = this.effects.find(effect => effect.getFlag("world", perditionStep.flag))
          if (!effect && perditionStep.effect) {  // Effet absent, à ajouter
            let effectData = {
              name: perditionStep.label,
              label: perditionStep.label,
              changes: [],
              disabled: false
            }
            if (perditionStep.effect == "malusDomaine") { // Specific logic for effect type
              for (let key in this.system.domaines) {
                effectData.changes.push({ key: `system.domaines.${key}.value`, value: -1, mode: 2 })
              }
            }
            if (perditionStep.effect == "malusTalent") { // Specific logic for effect type
              for (let keyDomaine in this.system.talents) {
                for (let key in this.system.talents[keyDomaine]) {
                  effectData.changes.push({ key: `system.talents.${keyDomaine}.${key}.niveau`, value: -1, mode: 2 })
                }
              }
            }
            let newEffect = await this.createEmbeddedDocuments("ActiveEffect", [effectData])
            newEffect[0].setFlag("world", perditionStep.flag, true)

          }
          if (perditionStep.sequelle) {
            this.addSequelle(perdition)
          };
          if (perditionStep.trait) {
            ui.notifications.warn("add trait");
            this.addTrait(perdition)
          }
        }
      }
    }
  }
  async addTrait(perdition) {
    let traits = this.system.traits || [];

    if (perdition == "noirceur") {
      this.noirceurTraitDialog()
    }
    if (perdition == "traque") {
      if (this.system.perditions.traque.value < 10) {
        if (!this.system.traits.find(t => t.label == "criminel")) {
          traits.push(NOC.traitsPerditions.traque.criminel)
        }

      }
      if (this.system.perditions.traque.value >= 10) {
        let traits = this.system.traits || [];
        if (!this.system.traits.find(t => t.label == "ennemi public")) {
          traits.push(NOC.traitsPerditions.traque.ennemi_public)
        }
      }

    }
    await this.update({
      'system.traits': traits
    })
  }
  async addSequelle(perdition) {
    let updateMin = {
      system: {
        perditions: {
        }
      }
    };
    updateMin.system.perditions[perdition] = { min: this.system.perditions[perdition].min + 1 }
    await this.update(updateMin)
  }

  async allTalentsMinus(label) {
    let effData = {
      label: label,
      changes: []
    }
    for (let dom in this.system.talents) {
      for (let tal in this.system.talents[dom]) {
        let key = "system.talents." + dom + "." + tal + ".niveau"
        effData.changes.push({
          key: key,
          mode: 2,
          value: "-1"
        })
      }

    }
    let newEff = await this.createEmbeddedDocuments("ActiveEffect", [effData]);
    newEff[0].setFlag("noc", "perdition", {
      label: label
    })
  }
  async allDomainesMinus(label) {
    let effData = {
      label: label,
      changes: []
    }
    for (let dom in this.system.domaines) {
      let key = "system.domaines." + dom + ".value"
      effData.changes.push({
        key: key,
        mode: 2,
        value: "-1"
      })
    }
    let newEff = await this.createEmbeddedDocuments("ActiveEffect", [effData]);
    newEff[0].setFlag("noc", "perdition", {
      label: label
    })
  }


  async removeTrait(label) {
    let traits = this.system.traits;
    let targetTrait = traits.find(t => t.label == label);
    traits.splice(traits.indexOf(targetTrait), 1);
    await this.update({
      'system.traits': traits
    })


  }
  async noirceurTraitDialog() {
    let dial = await nocNoirceurTraits.create(this);
    dial.render(true)

  }
  /**
   * Étapes de jeu (boutons de la fiche personnage) :
   * - calme    : Blessures, Trauma, Traque, Noirceur -1 (sans descendre sous le minimum) ;
   *              Espoir + 1 + Extase (sans dépasser le maximum)
   * - seance   : Singularité au maximum ; Vécu +1 (sans dépasser le maximum)
   * - scenario : Espoir au maximum ; faveurs des contacts rendues à la réserve
   */
  async etapeDeJeu(etape) {
    if (this.type !== "personnage") return;
    const s = this.system;
    const maj = {};
    const lignes = [];
    const nombre = v => Number(v) || 0;

    if (etape === "calme") {
      // Division de la cabale : 5 → pas d'Espoir ; 8 → ni Espoir ni Trauma ; 10 → ni Espoir, Trauma, Noirceur
      const division = divisionDuPersonnage(this);
      const bloques = new Set(division.palier >= 10 ? ["espoir", "trauma", "noirceur"] : division.palier >= 8 ? ["espoir", "trauma"] : division.palier >= 5 ? ["espoir"] : []);
      const raison = division.cabale ? `Division de la cabale ${division.cabale.name} (${division.palier})` : "";
      for (const perd of ["blessures", "trauma", "traque", "noirceur"]) {
        const p = s.perditions?.[perd];
        if (!p) continue;
        if (bloques.has(perd) && nombre(p.value) > nombre(p.min)) {
          lignes.push(`${p.label} : pas de récupération — ${raison}`);
          continue;
        }
        const valeur = nombre(p.value);
        const nouvelle = Math.max(nombre(p.min), valeur - 1);
        if (nouvelle !== valeur) {
          maj[`system.perditions.${perd}.value`] = nouvelle;
          lignes.push(`${p.label} : ${valeur} → ${nouvelle}`);
        }
      }
      if (this.flags?.noc?.fatigue) {
        maj["flags.noc.-=fatigue"] = null;
        lignes.push("Fatigue : levée");
      }
      const espoir = s.reserves.espoir;
      const gain = bloques.has("espoir") ? 0 : Math.max(0, 1 + nombre(s.talents?.ame?.extase?.niveau));
      if (bloques.has("espoir")) lignes.push(`Espoir : pas de récupération — ${raison}`);
      const nouvelEspoir = Math.min(nombre(espoir.max), nombre(espoir.value) + gain);
      if (nouvelEspoir !== nombre(espoir.value)) {
        maj["system.reserves.espoir.value"] = nouvelEspoir;
        lignes.push(`Espoir : ${nombre(espoir.value)} → ${nouvelEspoir}`);
      }
    } else if (etape === "seance") {
      const sing = s.reserves.singularite;
      if (nombre(sing.value) !== nombre(sing.max)) {
        maj["system.reserves.singularite.value"] = nombre(sing.max);
        lignes.push(`Singularité : ${nombre(sing.value)} → ${nombre(sing.max)}`);
      }
      const vecu = s.reserves.vecu;
      const nouveauVecu = Math.min(nombre(vecu.max), nombre(vecu.value) + 1);
      if (nouveauVecu !== nombre(vecu.value)) {
        maj["system.reserves.vecu.value"] = nouveauVecu;
        lignes.push(`Vécu : ${nombre(vecu.value)} → ${nouveauVecu}`);
      }
    } else if (etape === "scenario") {
      const espoir = s.reserves.espoir;
      if (nombre(espoir.value) !== nombre(espoir.max)) {
        maj["system.reserves.espoir.value"] = nombre(espoir.max);
        lignes.push(`Espoir : ${nombre(espoir.value)} → ${nombre(espoir.max)}`);
      }
      const contacts = foundry.utils.deepClone(s.contacts ?? []).filter(c => c && typeof c === "object");
      if (contacts.some(c => nombre(c.faveurs) || nombre(c.usedFaveurs)) || nombre(s.reserves.faveurs.value)) {
        for (const c of contacts) { c.faveurs = 0; c.usedFaveurs = 0; }
        maj["system.contacts"] = contacts;
        maj["system.reserves.faveurs.value"] = 0;
        lignes.push("Faveurs : toutes rendues à la réserve");
      }
    } else return;

    const titres = { calme: "Moment de calme", seance: "Début de séance", scenario: "Début de scénario" };
    if (Object.keys(maj).length) await this.update(maj);
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<h3>${titres[etape]}</h3>` + (lignes.length
        ? `<ul>${lignes.map(l => `<li>${l}</li>`).join("")}</ul>`
        : "<p>Aucun changement.</p>")
    });
  }

  resetContactFaveurs() {
    if (this.type != "personnage") { return false }
    let contactList = foundry.utils.deepClone(this.system.contacts).filter(c => c && typeof c === "object");
    for (let contact of contactList) {
      {
        contact.faveurs = 0;
        contact.usedFaveurs = 0;
      }
    }
    return this.update({
      "system.reserves.faveurs.value": 0,
      "system.contacts": contactList

    })
  }

  /* -------------------------------------------- */
  /** Identifiants des cabales du personnage (y compris l'ancienne cabale unique) */
  get cabaleIds() {
    const ids = [...(this.system.cabales ?? [])];
    const ancienne = this.system.cabale?.uuid;
    if (ancienne && !ids.includes(ancienne)) ids.push(ancienne);
    return ids;
  }

  /** Cabales du personnage (acteurs existants) */
  get cabalesActeurs() {
    return this.cabaleIds.map(id => game.actors.get(id)).filter(c => c?.type === "cabale");
  }

  async _enregistrerCabales(ids, aRafraichir) {
    await this.update({
      "system.cabales": ids,
      "system.cabale": { nom: "", uuid: "", bloc: "", coordonnes: "", societe: "" }
    });
    for (const id of aRafraichir) {
      const sheet = game.actors.get(id)?.sheet;
      if (sheet?.rendered) sheet.render(false);
    }
  }

  /** Ajoute ce personnage à une cabale (un personnage peut appartenir à plusieurs cabales) */
  async setCabale(cabale) {
    const id = cabale.id ?? cabale._id;
    const ids = this.cabaleIds;
    if (ids.includes(id)) return ui.notifications.info(`${this.name} fait déjà partie de la cabale ${cabale.name}.`);
    return this._enregistrerCabales([...ids, id], [id]);
  }

  /** Retire ce personnage d'une cabale */
  async leaveCabale(cabaleId) {
    const ids = this.cabaleIds;
    if (!ids.includes(cabaleId)) return;
    return this._enregistrerCabales(ids.filter(i => i !== cabaleId), [cabaleId]);
  }


  /* -------------------------------------------- */
  incDecReserve(reserveKey, value) {
    let reserve = foundry.utils.duplicate(this.system.reserves[reserveKey])
    reserve.value += value
    this.update({ [`system.reserves.${reserveKey}`]: reserve })
  }

  /* -------------------------------------------- */
  buildGenericRollData() {
    let rollData = {
      actorId: this.id,
      img: this.img,
      name: this.name,
      espoir: this.system.reserves.espoir.value,
      vecu: this.system.reserves.vecu.value,
      useEspoir: false,
      useVecu: false,
      nbBonusCollaboratif: 0,
      nbDesDomaine: 0,
      nbDesCabale: 0,
      cabaleData: null,
      // Rouage hostile : ses 1 aux dés de destin retirent du Fiel (p. 231)
      rouageHostile: estRouageHostile(this)
    }


    return rollData;
  }
  /** Cabales du personnage et ce qu'elles offrent pour ce jet (la première est proposée par défaut) */
  _ressourcesCabale(rollData, domaineId, talentId) {
    rollData.cabales = cabalesPourJet(this, domaineId, talentId)
    rollData.cabaleData = rollData.cabales[0] ?? null
    rollData.cabaleDomaine = rollData.cabaleData?.domaines?.[domaineId] ? foundry.utils.duplicate(rollData.cabaleData.domaines[domaineId]) : null
    rollData.atoutsCabale = {}
    rollData.uniteCabale = 0
    rollData.useEspoirCabale = false
    rollData.useVecuCabale = false
  }
  /* -------------------------------------------- */
  clearInitiative() {
    this.setFlag("world", "noc-last-initiative", -1)
  }
  /* -------------------------------------------- */
  getInitiativeScore(combatId, combatantId) {
    let init = this.getFlag("world", "noc-last-initiative") || -1
    if (init == -1) {
      ui.notifications.info("Vous n'avez pas enregistré d'Initiative pour ce combat, jet d'Instinct à faire.")
      this.rollTalent("action", "instinct", { isInit: true, combatId: combatId, combatantId: combatantId })
    }
    return init
  }

  /* -------------------------------------------- */
  rollTalent(domaineId, talentId, combatData = undefined) {
    let rollData = this.buildGenericRollData()

    // Specific stuff
    rollData.title = "Talent"
    rollData.mode = "talent"
    rollData.combatData = combatData
    rollData.domaineId = domaineId
    rollData.domaine = foundry.utils.duplicate(this.system.domaines[domaineId])
    rollData.talent = foundry.utils.duplicate(this.system.talents[domaineId][talentId])
    rollData.talentId = talentId

    this._ressourcesCabale(rollData, domaineId, talentId)
    // Stratagèmes (Ergonomie, Sensibilité) des objets liés à ce talent : cases à cocher
    rollData.equipements = bonusEquipementTalent(this, domaineId, talentId)

    this.startRoll(rollData)
  }

  /* -------------------------------------------- */
  rollItem(itemId) {
    let item = this.items.get(itemId)
    // un outil s'utilise comme une arme improvisée : jamais maîtrisée, toujours complexe
    let arme = null
    if (item?.type == "arme") {
      arme = foundry.utils.duplicate(item)
      // valeurs calculées (formule de dégâts, texte des traits), absentes de la copie brute
      arme.system.degats = item.system.degats
      arme.system.traits = item.system.traits
    } else if (item?.type == "outil" && !item.system.improvisee?.active && item.system.stratagemes?.mortel) {
      // stratagème Mortel : l'outil cache une lame ou un poinçon (arme de contact, Constitution + 2)
      arme = {
        _id: item.id, name: item.name, img: item.img, type: "outil", lameCachee: true,
        system: {
          adistance: false,
          maitrise: true,
          traitsArme: {},
          degats: "@talents.action.constitution.niveau + 2",
          traits: "Lame cachée (stratagème Mortel)"
        }
      }
    } else if (item?.type == "outil" && item.system.improvisee?.active) {
      const imp = item.system.improvisee ?? {}
      const distance = imp.mode === "distance"
      const n = Number(imp.degats) || 0
      arme = {
        _id: item.id, name: item.name, img: item.img, type: "outil",
        system: {
          adistance: distance,
          maitrise: false,
          traitsArme: { complexe: true },
          degats: distance ? `${n}` : `@talents.action.constitution.niveau + ${n}`,
          traits: "Arme improvisée, Complexe"
        }
      }
    }
    if (item && arme) {
      // Gabarit de corrompu frénétique : Multiple sur la copie de l'arme
      arme = armeAvecGabarit(this, arme)
      // Stratagèmes de l'objet : Ergonomie (+1 en Combat), Mortel (dégâts +1, déjà compté pour une lame cachée)
      const strat = armeAvecStratagemes(arme.lameCachee ? { system: { stratagemes: { ...item.system.stratagemes, mortel: false } } } : item, arme)
      arme = strat.arme
      let rollData = this.buildGenericRollData()
      // Specific stuff
      rollData.title = "Arme"
      rollData.mode = "arme"
      rollData.arme = arme
      rollData.domaineId = 'action'
      rollData.domaine = foundry.utils.duplicate(this.system.domaines['action'])
      rollData.talent = foundry.utils.duplicate(this.system.talents['action']['combat'])
      // niveau requis : base (0 à distance, 1 au contact) + maîtrise + modificateurs
      rollData.niveauBase = (arme.system.adistance) ? 0 : 1
      rollData.niveauRequis = rollData.niveauBase
      rollData.modMaitrise = arme.system.maitrise ? 0 : (arme.system.traitsArme?.complexe ? 2 : 1)
      rollData.longuePortee = !!arme.system.traitsArme?.longuePortee
      rollData.modDistance = 0
      rollData.modCouvert = 0
      rollData.modConditions = 0
      rollData.cibleAuSol = false
      rollData.modSupplement = 0
      rollData.niveauFinalRequis = rollData.niveauBase + rollData.modMaitrise
      rollData.bonusStratagemeArme = strat.bonusCombat
      rollData.lignesStratagemes = strat.lignes

      this._ressourcesCabale(rollData, 'action', 'combat')

      this.startRoll(rollData)
    } else {
      const speaker = ChatMessage.getSpeaker({ user: game.user });
      // a simple chat message for now
      ChatMessage.create({
        whisper: game.user.id,
        speaker: speaker,
        content: `
      <h3>${item.name} </h3>
      <p>${item.system.description}</p>
      <img src="${item.img}" width="100%" height="auto">
      `
      });
    }
  }

  /* -------------------------------------------- */
  async startRoll(rollData) {
    let rollDialog = await nocRollDialog.create(this, rollData)
    rollDialog.render(true)
  }
  async creatureAttaque() {
    if (this.type != "creature") { return }
    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this });
    const rollMode = game.settings.get('core', 'rollMode');
    // a simple chat message for now
    ChatMessage.create({
      speaker: speaker,
      rollMode: rollMode,
      content: `
      <h3>${this.name} attaque !  ${this.system.attaque.label}</h3>
      <p>[[${this.system.attaque.degats}]] dégats</p>
      `
    });
  }

  /* -------------------------------------------- */
  getRollData() {
    const data = { ...super.getRollData() };

    // Copy the actor's system data for easy access
    data.talents = this.system.talents;
    data.domaines = this.system.domaines;
    data.reserves = this.system.reserves;
    data.perditions = this.system.perditions;
    console.log("getrolldata actor", data);
    return data;
  }

}
