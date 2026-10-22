import { nocActorSheetPersonnage } from "./actor-sheet-personnage.mjs";
import { ATOUTS, RESERVES_CABALE, JAUGES_CABALE, membresCabale, infligerCabale } from "../../cabale.mjs";

const nombre = v => Number(v) || 0;
const TYPES = {
  support: "Atout de support : 1 point = +1 au Talent lié",
  capital: "Atout de support : un ou plusieurs points = autant de bonus au Talent lié",
  usages: "Utilisations par scénario",
  reserve: "Fournit une réserve commune",
  conditionnel: "Bonus de situation"
};


/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class nocActorSheetCabale extends nocActorSheetPersonnage {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["noc", "sheet", "actor", "cabale"],
      width: 900,
      height: 700,
      dragDrop: [
        { dragSelector: ".item-list .item", dropSelector: null },
      ],

      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "principal" }]
    });
  }

  /** @override */
  get template() {
    return `systems/noc/templates/actor/actor-${this.actor.type}-sheet.html`;
  }
  /* -------------------------------------------- */
  /*  Drag and Drop                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _canDragStart(selector) {
    return this.isEditable;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canDragDrop(selector) {
    return this.isEditable;
  }
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    const actor = this.actor;

    /**
     * A hook event that fires when some useful data is dropped onto an ActorSheet.
     * @function dropActorSheetData
     * @memberof hookEvents
     * @param {Actor} actor      The Actor
     * @param {ActorSheet} sheet The ActorSheet application
     * @param {object} data      The data that has been dropped onto the sheet
     */
    const allowed = Hooks.call("dropActorSheetData", actor, this, data);
    if (allowed === false) return;

    // Handle different data types
    switch (data.type) {

      case "Actor":
        return this._onDropActor(event, data);
      case "Item":
        return this._onDropItem(event, data);

    }
  }
  async _onDropActor(ev, data) {
    let dropActor = await Actor.implementation.fromDropData(data);
    if (!dropActor) return false;
    if (dropActor.type != "personnage") {
      return ui.notifications.warn("Vous ne pouvez ajouter que des personnages aux cabales");
    }
    // un personnage du monde (pas une copie de compendium ni un jeton non lié)
    const membre = game.actors.get(dropActor.id);
    if (!membre) return ui.notifications.warn("Glissez un personnage depuis l'onglet Acteurs.");
    if (!this.actor.isOwner || !membre.isOwner) {
      return ui.notifications.warn("Vous n'avez pas de droits sur ce personnage ; demandez à la Loi de l'ajouter.");
    }
    await membre.setCabale(this.actor);
    return this.render(false);
  }
  _onDropItem(ev, data) {
  }
  /* -------------------------------------------- */

  /** @override */
  getData() {
    // Retrieve the data structure from the base sheet. You can inspect or log
    // the context variable to see the structure, but some key properties for
    // sheets are the actor object, the data object, whether or not it's
    // editable, the items array, and the effects array.
    const context = super.getData();

    // Prepare character data and items.
    this._preparePersonnageData(context);

    return context;
  }

  /* -------------------------------------------- */
  _preparePersonnageData(context) {
    context.members = membresCabale(this.actor);
    const s = this.actor.system;
    // domaines et leurs atouts
    context.domainesCabale = Object.entries(s.domaines ?? {}).map(([cle, d]) => ({
      cle, label: d.label, score: d.score, restant: d.restant,
      atouts: Object.entries(s.talents?.[cle] ?? {}).map(([atout, t]) => {
        const def = ATOUTS[atout] ?? {};
        const lignes = [`<strong>Talent lié : ${def.talentLabel ?? "?"}</strong>`];
        if (TYPES[def.type]) lignes.push(`<em>${TYPES[def.type]}${def.support ? ` (${def.support})` : ""}</em>`);
        if (def.effet) lignes.push(def.effet);
        if (def.faille) lignes.push(`Faille (niveau −1) : ${def.faille}`);
        return {
          cle: atout, domaine: cle, label: def.label ?? t.label, niveau: nombre(t.niveau),
          faille: nombre(t.niveau) <= -1, support: def.type === "support" || def.type === "capital",
          aPoints: t.points !== undefined && t.points > 0, points: t.points, restant: t.restant,
          tooltip: lignes.join("<br>")
        };
      })
    }));
    context.reservesCabale = Object.entries(RESERVES_CABALE).map(([cle, r]) => ({
      cle, label: r.label, source: s.reserves?.[cle]?.source ?? ATOUTS[r.atout].label,
      value: nombre(s.reserves?.[cle]?.value), max: nombre(s.reserves?.[cle]?.max),
      tooltip: cle === "faveurs" ? "2 Faveurs par Contact du Réseau" : `Réserve commune égale au niveau de ${ATOUTS[r.atout].label}${cle === "vecu" ? ", plus les achats" : ""}`
    }));
    context.vecuAchats = nombre(s.vecuAchats);
    context.jaugesCabale = Object.entries(JAUGES_CABALE).map(([cle, j]) => ({
      cle, label: j.label, value: nombre(s.perditions?.[cle]?.value), max: nombre(s.perditions?.[cle]?.max) || 10,
      statut: s.perditions?.[cle]?.statut ?? {}
    }));
    const fort = nombre(s.talents?.action?.fortifications?.niveau);
    context.fortifications = fort > 0 ? { niveau: fort, restant: s.fortificationsRestant } : null;
    context.atoutsPossedes = s.atoutsPossedes;
    context.limiteAtouts = s.limiteAtouts;
    context.standing = nombre(s.talents?.statut?.standing?.niveau);
    context.depassement = s.atoutsPossedes > s.limiteAtouts;
    context.failles = s.failles ?? [];
    context.atoutsInutilisables = s.atoutsInutilisables;
  }
  /* -------------------------------------------- */

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.find('.remove-member').click(async ev => {
      const membre = game.actors.get(ev.currentTarget.dataset.actorId);
      if (!membre) return;
      if (!membre.isOwner) return ui.notifications.warn("Vous n'avez pas de droits sur ce personnage.");
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Retirer un membre" },
        content: `<p>Retirer ${membre.name} de la cabale ?</p>`
      });
      if (ok) await membre.leaveCabale(this.actor.id);
      this.render(false);
    });
    html.find('.display-actor').click(ev => {
      const actorId = $(ev.currentTarget).data("actor-id")
      let actor = game.actors.get(actorId);
      actor.sheet.render(true);
    })
    if (this.isEditable) {
      // niveau d'un Atout (−1 donne une faille) et score d'un Domaine
      html.find('.atout-ctrl a').click(ev => this._modifier(ev, "talents", -1));
      html.find('.domaine-ctrl a').click(ev => this._modifier(ev, "domaines", 0));
      // dés de Domaine et points d'Atouts restants (correction manuelle)
      html.find('a.restant-ctrl').click(ev => this._modifierRestant(ev.currentTarget));
      html.find('a.vecu-achats').click(ev => {
        const valeur = Math.max(0, nombre(this.actor._source.system.vecuAchats) + nombre(ev.currentTarget.dataset.ecart));
        this.actor.update({ "system.vecuAchats": valeur });
      });
      html.find('button.dommages-cabale').click(() => this._dommages());
    }
    let membersImages = html.find('div.img');
    for (let el of membersImages) { this.randomRotate(el) }
    // Delete Inventory Item
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.delete();
      li.slideUp(200, () => this.render(false));
    });

  }
  /** +/- sur un niveau d'Atout (minimum −1) ou un score de Domaine (minimum 0) */
  async _modifier(ev, groupe, min) {
    const cle = ev.currentTarget.closest("[data-key]").dataset.key;
    const actuel = nombre(foundry.utils.getProperty(this.actor._source, cle));
    const ecart = ev.currentTarget.classList.contains("fa-add") ? 1 : -1;
    const valeur = Math.max(min, actuel + ecart);
    if (valeur !== actuel) await this.actor.update({ [cle]: valeur });
  }

  /** Corrige les dés ou points restants : on modifie le nombre de dépensés */
  async _modifierRestant(lien) {
    const { groupe, cle } = lien.dataset;
    const ecart = nombre(lien.dataset.ecart);
    const s = this.actor.system;
    const chemin = groupe === "fortifications" ? "system.depenses.fortifications" : `system.depenses.${groupe}.${cle}`;
    const max = groupe === "domaines" ? nombre(s.domaines?.[cle]?.score)
      : groupe === "fortifications" ? Math.max(0, nombre(s.talents?.action?.fortifications?.niveau))
      : nombre(s.talents?.[ATOUTS[cle]?.domaine]?.[cle]?.points);
    const depenses = nombre(foundry.utils.getProperty(this.actor._source, chemin));
    const valeur = Math.max(0, Math.min(max, depenses - ecart));
    if (valeur !== depenses) await this.actor.update({ [chemin]: valeur });
  }

  /** Fenêtre des dommages : réductions de la cabale appliquées */
  async _dommages() {
    const options = Object.entries(JAUGES_CABALE).map(([cle, j]) => `<option value="${cle}">${j.label}</option>`).join("");
    const contenu = `<div class="noc dommages-cabale-dialog">
      <div class="form-group"><label>Jauge</label><select name="jauge">${options}</select></div>
      <div class="form-group"><label>Points</label><input type="number" name="points" value="1" min="1" max="10"></div>
      <div class="form-group"><label><input type="checkbox" name="reduire" checked> Appliquer les réductions</label></div>
      <div class="form-group"><label><input type="checkbox" name="objet"> Noirceur d'un objet corrompu entreposé (Salle blanche)</label></div>
      <p class="notes">Réductions : Dégradation − Fortifications (qui perdent 1 point jusqu'à réparation complète), Traque − Sociétés écrans, Noirceur d'objet entreposé − Salle blanche.</p>
    </div>`;
    const lire = (bouton) => {
      const f = bouton.form.elements;
      return { cle: f.jauge.value, points: Math.max(0, nombre(f.points.value)), reduire: f.reduire.checked, objet: f.objet.checked };
    };
    const choix = await foundry.applications.api.DialogV2.wait({
      window: { title: `Dommages : ${this.actor.name}` },
      content: contenu,
      buttons: [
        { action: "infliger", label: "Infliger", icon: "fa-solid fa-burst", default: true, callback: (event, bouton) => ({ ...lire(bouton), signe: 1 }) },
        { action: "retirer", label: "Retirer", icon: "fa-solid fa-hammer", callback: (event, bouton) => ({ ...lire(bouton), signe: -1 }) }
      ],
      rejectClose: false
    });
    if (!choix || !choix.points) return;
    const ligne = await infligerCabale(this.actor, choix.cle, choix.signe * choix.points, { reduire: choix.reduire, objetCorrompu: choix.objet });
    if (ligne) ChatMessage.create({
      content: `<div class="nocRoll"><h4>Dommages de la cabale</h4><p>${ligne}</p></div>`,
      whisper: game.users.filter(u => u.isGM || this.actor.testUserPermission(u, "OWNER")).map(u => u.id),
      speaker: ChatMessage.getSpeaker({ actor: this.actor })
    });
  }

  randomRotate(element) {
    let rdm = () => { return Math.floor(Math.random() * 10) - 5 };
    element.style.transform = `rotate(${rdm()}deg)`;
    element.style.top = `${rdm() * 2}%`;
    element.style.right = `${rdm() * 2}%`

  }
}
