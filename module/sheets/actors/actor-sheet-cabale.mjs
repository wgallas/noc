import { NocFicheActeur } from "./fiche-acteur.mjs";
import { confirmer, donneesGlisser, ecouter } from "../v2-outils.mjs";
import { ATOUTS, RESERVES_CABALE, JAUGES_CABALE, TYPES_MEMBRES_CABALE, membresCabale, rouagesCabale, infligerCabale } from "../../cabale.mjs";
import { assistantCreation, apportHeros, retirerApport, modifierApport, apportsCabale, entretien, semainesSansNoirceur, espritDeCorps, depenserProgression, donProgression, intermede } from "../../cabale-gestion.mjs";

const nombre = v => Number(v) || 0;
const TYPES = {
  support: "Atout de support : 1 point = +1 au Talent lié",
  capital: "Atout de support : un ou plusieurs points = autant de bonus au Talent lié",
  usages: "Utilisations par scénario",
  reserve: "Fournit une réserve commune",
  conditionnel: "Bonus de situation"
};


/** Fiche de cabale (ApplicationV2) */
export class nocActorSheetCabale extends NocFicheActeur {

  static DEFAULT_OPTIONS = {
    classes: ["cabale"],
    position: { width: 920, height: 780 }
  };
  static MODELE = "systems/noc/templates/actor/actor-cabale-sheet.html";
  static ONGLET_INITIAL = "profil";
  static GLISSABLES = ".item-list .item";
  static PARTS = { main: { template: "systems/noc/templates/actor/actor-cabale-sheet.html" } };

  /** La cabale n'a pas de vue limitée (comme avant) */
  get estLimitee() { return false; }

  /** @override : seuls des personnages et des Rouages se déposent sur une cabale */
  async _onDrop(event) {
    const data = donneesGlisser(event);
    if (!data) return;
    const allowed = Hooks.call("dropActorSheetData", this.actor, this, data);
    if (allowed === false) return;
    if (data.type === "Actor") return this._nocDeposerActeur(event, data);
  }

  async _nocDeposerActeur(ev, data) {
    const dropActor = await Actor.implementation.fromDropData(data);
    if (!dropActor) return false;
    if (!TYPES_MEMBRES_CABALE.includes(dropActor.type)) {
      return ui.notifications.warn("Vous ne pouvez ajouter que des personnages et des Rouages aux cabales");
    }
    // un acteur du monde (pas une copie de compendium) ; un jeton non lié renvoie à son acteur
    const membre = game.actors.get(dropActor.id);
    if (!membre) return ui.notifications.warn("Glissez un personnage ou un Rouage depuis l'onglet Acteurs.");
    if (!this.actor.isOwner || !membre.isOwner) {
      return ui.notifications.warn(`Vous n'avez pas de droits sur ${membre.name} ; demandez à la Loi de l'ajouter.`);
    }
    await membre.setCabale(this.actor);
    return this.render();
  }

  /* -------------------------------------------- */
  _preparePersonnageData(context) {
    context.members = membresCabale(this.actor);
    context.rouagesMembres = rouagesCabale(this.actor);
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
    context.regressions = [...(s.regressions ?? [])].reverse();
    // apports des Héros : qui soutient quel Atout (Héros disparu si sa fiche n'existe plus)
    context.apports = apportsCabale(this.actor).map((x, index) => ({
      index, nom: x.nom, atout: ATOUTS[x.atout]?.label ?? "Atout non précisé",
      existe: !!game.actors.get(x.heros)
    }));
    context.isGM = game.user.isGM;
  }
  /* -------------------------------------------- */

  /* -------------------------------------------- */

  /** @override */
  activerEcouteurs(html) {
    super.activerEcouteurs(html);

    ecouter(html, ".remove-member", async ev => {
      const membre = game.actors.get(ev.currentTarget.dataset.actorId);
      if (!membre) return;
      if (!membre.isOwner) return ui.notifications.warn("Vous n'avez pas de droits sur ce personnage.");
      if (await confirmer("Retirer un membre", `<p>Retirer ${membre.name} de la cabale ?</p>`)) {
        await membre.leaveCabale(this.actor.id);
      }
      this.render();
    });
    ecouter(html, ".display-actor", ev => game.actors.get(ev.currentTarget.dataset.actorId)?.sheet.render(true));
    if (this.isEditable) {
      // niveau d'un Atout (−1 donne une faille) et score d'un Domaine
      ecouter(html, ".atout-ctrl a", ev => this._modifier(ev, "talents", -1));
      ecouter(html, ".domaine-ctrl a", ev => this._modifier(ev, "domaines", 0));
      // dés de Domaine et points d'Atouts restants (correction manuelle)
      ecouter(html, "a.restant-ctrl", ev => this._modifierRestant(ev.currentTarget));
      ecouter(html, "a.vecu-achats", ev => {
        const valeur = Math.max(0, nombre(this.actor._source.system.vecuAchats) + nombre(ev.currentTarget.dataset.ecart));
        this.actor.update({ "system.vecuAchats": valeur });
      });
      ecouter(html, "button.dommages-cabale", () => this._dommages());
      // création, entretien et progression
      const actions = {
        creation: assistantCreation, apport: apportHeros,
        "retirer-apport": retirerApport, "modifier-apport": modifierApport,
        reparer: c => entretien(c, "reparer"), soupcons: c => entretien(c, "soupcons"),
        noirceur: semainesSansNoirceur, division: espritDeCorps,
        depenser: depenserProgression, don: donProgression, intermede
      };
      ecouter(html, "[data-gestion]", ev => actions[ev.currentTarget.dataset.gestion]?.(this.actor, ev.currentTarget.dataset));
    }
    for (const el of html.querySelectorAll("div.img")) this.randomRotate(el);
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
