import { nocUtility } from "../noc-utility.js";
import { fluxPourJet, imposerMinimumFlux } from "../flux.mjs";

const echapper = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/** Bloc de la fenêtre de jet : ce que le personnage peut puiser dans sa cabale */
export function htmlCabale(rollData) {
  const c = rollData.cabaleData;
  if (!c) return "";
  const cabales = rollData.cabales ?? [];
  const nom = cabales.length > 1
    ? `<select id="cabaleChoice">${cabales.map(x => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${echapper(x.name)}</option>`).join("")}</select>`
    : echapper(c.name);
  let html = `<div class="cabale-jet"><h4 class="titre-cabale">Cabale : ${nom}</h4>`;
  if (c.inutilisables) html += `<p class="ligne-grise">Dégradation 5 ou plus : les Atouts et les réserves de la cabale ne servent plus jusqu'à réparation.</p>`;
  const dom = c.domaines?.[rollData.domaineId];
  if (dom) {
    const restant = Math.max(0, Number(dom.value) || 0);
    const options = Array.from({ length: restant + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join("");
    html += `<div class="fexrow form-group cabale-dice">
      <h4><div class="nbrDes"><span>Dés de cabale : </span><span data-display-range="nbDesCabale">${Number(rollData.nbDesCabale) || 0}</span> <i class="fa-light fa-dice-d10"></i></div>
      <div><span>${echapper(dom.label)} : ${pluriel(restant, "dé")} restant${restant > 1 ? "s" : ""} sur ${dom.score}</span></div></h4>
      <input class="noc-slider" id="nbDesCabale" value="${Math.min(restant, Number(rollData.nbDesCabale) || 0)}" type="range" step="1" min="0" max="${restant}" list="nbDesCabaleList" ${restant ? "" : "disabled"}>
      <datalist id="nbDesCabaleList">${options}</datalist></div>`;
  }
  for (const a of c.atouts ?? []) {
    const condition = a.condition ? ` <span class="ligne-grise">(${echapper(a.condition)})</span>` : "";
    if (a.type === "capital") {
      const pris = Number(rollData.atoutsCabale?.[a.cle]) || 0;
      html += `<div class="case-option atout-cabale ${a.restant ? "" : "indisponible"}"><span>${echapper(a.label)} : </span>
        <span class="valeur-atout">${pris ? "+" + pris : "0"}</span>
        <a class="bouton-atout" data-atout="${a.cle}" data-ecart="-1" title="Retirer 1"><i class="fas fa-minus"></i></a>
        <a class="bouton-atout" data-atout="${a.cle}" data-ecart="1" title="Ajouter 1"><i class="fas fa-plus"></i></a>
        <span class="ligne-grise">(${a.restant} point${a.restant > 1 ? "s" : ""} sur ${a.points})</span></div>`;
    } else if (a.type === "conditionnel") {
      const texte = a.faille ? `Faille Démotivation : −1` : `${echapper(a.label)} : +${a.bonus}`;
      html += `<label class="case-option atout-cabale ${a.bonus ? "" : "indisponible"}"><input type="checkbox" class="unite-cabale" data-bonus="${a.bonus}" ${rollData.uniteCabale ? "checked" : ""} ${a.bonus ? "" : "disabled"}/>
        <span>${texte}</span>${condition}</label>`;
    } else {
      html += `<label class="case-option atout-cabale ${a.restant ? "" : "indisponible"}"><input type="checkbox" class="support-cabale" data-atout="${a.cle}" ${rollData.atoutsCabale?.[a.cle] ? "checked" : ""} ${a.restant ? "" : "disabled"}/>
        <span>${echapper(a.label)} : +1</span> <span class="ligne-grise">(${a.restant} point${a.restant > 1 ? "s" : ""} sur ${a.points})</span>${condition}</label>`;
    }
  }
  return html + "</div>";
}

/**
 * Bloc des dépenses du jet : 1 point d'Espoir (+3 dés) ou de Vécu (+1 niveau),
 * pris au Héros ou à sa cabale (un seul des deux par ligne).
 */
export function htmlDepenses(rollData) {
  const c = rollData.cabaleData;
  const caseDepense = (id, n) => {
    n = Number(n) || 0;
    return `<label class="depense-case ${n ? "" : "indisponible"}" data-tooltip="${n ? pluriel(n, "point") + " disponible" + (n > 1 ? "s" : "") : "aucun point disponible"}">
      <input type="checkbox" id="${id}" ${rollData[id] ? "checked" : ""} ${n ? "" : "disabled"}/><span class="depense-reste">${n}</span></label>`;
  };
  const ligne = (nom, effet, idHeros, nHeros, idCabale, nCabale) => `<div class="depense-ligne">
      <span class="depense-nom">${nom} <em>${effet}</em></span>
      ${caseDepense(idHeros, nHeros)}${c ? caseDepense(idCabale, nCabale) : ""}</div>`;
  return `<div class="depenses-jet ${c ? "avec-cabale" : ""}">
    <div class="depense-entete"><span>Dépenser 1 point</span><span>Héros</span>${c ? "<span>Cabale</span>" : ""}</div>
    ${ligne("Espoir", "+3 dés", "useEspoir", rollData.espoir, "useEspoirCabale", c?.espoir)}
    ${ligne("Vécu", "+1 niveau de talent", "useVecu", rollData.vecu, "useVecuCabale", c?.vecu)}
  </div>`;
}

/** Délégation d'évènements : gestionnaire(ev, élément correspondant au sélecteur) */
function deleguer(racine, types, selecteur, gestionnaire) {
  for (const type of types.split(" ")) {
    racine.addEventListener(type, ev => {
      const el = ev.target.closest?.(selecteur);
      if (el && racine.contains(el)) gestionnaire(ev, el);
    });
  }
}

/** Fenêtre de jet (DialogV2) */
export class nocRollDialog extends foundry.applications.api.DialogV2 {

  /* -------------------------------------------- */
  static async create(actor, rollData) {
    rollData.cabaleHtml = htmlCabale(rollData);
    rollData.depensesHtml = htmlDepenses(rollData);
    // Flux d'un Seuil (réglé par le MJ) : jusqu'à Domaine + Flux dés de domaine
    if (rollData.flux === undefined) Object.assign(rollData, fluxPourJet());
    const domaineDes = Number(rollData.domaine?.value) || 0;
    rollData.maxDesAvecFlux = domaineDes + (rollData.flux || 0);
    rollData.maxDesDomaine = domaineDes + (rollData.fluxActif ? rollData.flux : 0);
    const html = await foundry.applications.handlebars.renderTemplate('systems/noc/templates/window_app/dialog-roll-generic.hbs', rollData);
    delete rollData.cabaleHtml;
    delete rollData.depensesHtml;
    return new nocRollDialog(actor, rollData, html);
  }

  /* -------------------------------------------- */
  constructor(actor, rollData, html) {
    super({
      window: { title: `${rollData.name ?? actor.name} — ${rollData.title ?? "Jet"}` },
      classes: ["nocDialog"],
      position: { width: 420 },
      content: html,
      buttons: [
        { action: "roll", label: "Lancer !", icon: "fas fa-check", default: true, callback: (event, bouton, dialog) => dialog.roll() },
        { action: "cancel", label: "Annuler", icon: "fas fa-times" }
      ]
    });
    this.actor = actor;
    this.rollData = rollData;
  }

  /* -------------------------------------------- */
  roll() {
    // près d'un Seuil : au moins Flux dés de destin si le personnage provoque le destin
    imposerMinimumFlux(this.rollData)
    nocUtility.roll(this.rollData)
  }

  /** Racine du contenu de la fenêtre */
  get contenu() {
    return this.element?.querySelector(".skill-roll-dialog") ?? this.element;
  }

  /* -------------------------------------------- */
  updateNiveauFinal() {
    const html = this.contenu;
    for (const input of html.querySelectorAll('input')) {
      if (!input.id) continue;
      if (input.type === "range") this.rollData[input.id] = Number(input.value);
      if (input.type === "checkbox") this.rollData[input.id] = input.checked;
    }
    if (this.rollData.arme) {
      const r = this.rollData;
      const distance = r.arme.system.adistance;
      r.niveauFinalRequis = (Number(r.niveauBase) || 0) + (Number(r.modMaitrise) || 0)
        + (distance ? (Number(r.modDistance) || 0) + (Number(r.modCouvert) || 0) : 0)
        + (Number(r.modConditions) || 0)
        + (r.cibleAuSol ? (distance ? 1 : -1) : 0)
        + (Number(r.modSupplement) || 0);
    } else if (this.rollData.niveauRequis !== undefined) {
      this.rollData.niveauFinalRequis = (Number(this.rollData.niveauRequis) || 0) + (Number(this.rollData.modCouvert) || 0) + (Number(this.rollData.modSupplement) || 0)
    }
    const cible = html.querySelector('#niveauFinalRequis');
    if (cible) cible.innerHTML = this.rollData.niveauFinalRequis;
  }

  /* -------------------------------------------- */
  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const html = this.contenu;
    const r = this.rollData;
    const un = sel => html.querySelector(sel);
    const sur = (sel, type, fn) => { for (const el of html.querySelectorAll(sel)) el.addEventListener(type, fn); };
    this.updateNiveauFinal();

    // un seul point d'Espoir et un seul point de Vécu par jet : celui du Héros ou celui de la cabale
    deleguer(html, 'change', '#useEspoir', (ev, el) => {
      r.useEspoir = el.checked;
      if (r.useEspoir) { r.useEspoirCabale = false; const c = un('#useEspoirCabale'); if (c) c.checked = false; }
    });
    deleguer(html, 'change', '#useVecu', (ev, el) => {
      r.useVecu = el.checked;
      if (r.useVecu) { r.useVecuCabale = false; const c = un('#useVecuCabale'); if (c) c.checked = false; }
    });
    sur('#cibleAuSol', 'change', ev => {
      r.cibleAuSol = ev.currentTarget.checked;
      this.updateNiveauFinal();
    });
    sur('#nbDesDomaine', 'change', ev => { r.nbDesDomaine = Number(ev.currentTarget.value); });
    // Flux d'un Seuil : la case change le nombre maximum de dés de domaine
    sur('#fluxActif', 'change', ev => {
      r.fluxActif = ev.currentTarget.checked;
      r.maxDesDomaine = (Number(r.domaine?.value) || 0) + (r.fluxActif ? r.flux : 0);
      const curseur = un('#nbDesDomaine');
      curseur.max = r.maxDesDomaine;
      if (Number(curseur.value) > r.maxDesDomaine) curseur.value = r.maxDesDomaine;
      r.nbDesDomaine = Number(curseur.value);
      const aff = un('[data-display-range="nbDesDomaine"]');
      if (aff) aff.innerHTML = String(r.nbDesDomaine);
    });
    this.activerCabale(html);
    // Stratagèmes : objet ergonomique ou sensible à la Noirceur utilisé pour ce jet
    sur('input.bonus-equipement', 'change', ev => {
      const e = r.equipements?.[Number(ev.currentTarget.dataset.index)];
      if (e) e.actif = ev.currentTarget.checked;
    });
    // bonus collaboratif : boutons +/- (minimum 0)
    sur('a.bouton-collaboratif', 'click', ev => {
      ev.preventDefault();
      const ecart = Number(ev.currentTarget.dataset.ecart) || 0;
      const valeur = Math.max(0, (Number(r.nbBonusCollaboratif) || 0) + ecart);
      r.nbBonusCollaboratif = valeur;
      const aff = un('#nbBonusCollaboratif');
      if (aff) aff.innerHTML = valeur > 0 ? `+${valeur}` : "0";
    });
    sur('#modDistance, #modConditions', 'change', () => this.updateNiveauFinal());
    sur('#modCouvert', 'change', ev => { r.modCouvert = Number(ev.currentTarget.value); this.updateNiveauFinal(); });
    sur('#modSupplement', 'change', ev => { r.modSupplement = Number(ev.currentTarget.value); this.updateNiveauFinal(); });
    deleguer(html, 'change', 'input[type="range"]', (ev, el) => this.displayRange(el));
  }

  /** Bloc de la cabale : choix de la cabale, dés, Atouts, Espoir et Vécu communs */
  activerCabale(html) {
    const r = this.rollData;
    const rafraichir = () => {
      const bloc = html.querySelector('.bloc-cabale');
      if (bloc) bloc.innerHTML = htmlCabale(r);
      const depenses = html.querySelector('.bloc-depenses');
      if (depenses) depenses.innerHTML = htmlDepenses(r);
      this.setPosition({ height: "auto" });
    };
    deleguer(html, 'change', '#cabaleChoice', (ev, el) => {
      const cabale = (r.cabales ?? []).find(c => c.id === el.value);
      if (!cabale) return;
      r.cabaleData = cabale;
      r.cabaleDomaine = cabale.domaines?.[r.domaineId] ? foundry.utils.deepClone(cabale.domaines[r.domaineId]) : null;
      r.nbDesCabale = 0;
      r.atoutsCabale = {};
      r.uniteCabale = 0;
      r.useEspoirCabale = false;
      r.useVecuCabale = false;
      rafraichir();
    });
    deleguer(html, 'input change', '#nbDesCabale', (ev, el) => {
      r.nbDesCabale = Number(el.value) || 0;
      const aff = html.querySelector('[data-display-range="nbDesCabale"]');
      if (aff) aff.innerHTML = String(r.nbDesCabale);
    });
    deleguer(html, 'change', 'input.support-cabale', (ev, el) => {
      r.atoutsCabale ??= {};
      r.atoutsCabale[el.dataset.atout] = el.checked ? 1 : 0;
    });
    deleguer(html, 'click', 'a.bouton-atout', (ev, el) => {
      ev.preventDefault();
      const cle = el.dataset.atout;
      const atout = (r.cabaleData?.atouts ?? []).find(a => a.cle === cle);
      if (!atout) return;
      r.atoutsCabale ??= {};
      const valeur = (Number(r.atoutsCabale[cle]) || 0) + (Number(el.dataset.ecart) || 0);
      r.atoutsCabale[cle] = Math.max(0, Math.min(Number(atout.restant) || 0, valeur));
      rafraichir();
    });
    deleguer(html, 'change', 'input.unite-cabale', (ev, el) => {
      r.uniteCabale = el.checked ? Number(el.dataset.bonus) || 0 : 0;
    });
    deleguer(html, 'change', '#useEspoirCabale', (ev, el) => {
      r.useEspoirCabale = el.checked;
      if (r.useEspoirCabale) { r.useEspoir = false; const c = html.querySelector('#useEspoir'); if (c) c.checked = false; }
    });
    deleguer(html, 'change', '#useVecuCabale', (ev, el) => {
      r.useVecuCabale = el.checked;
      if (r.useVecuCabale) { r.useVecu = false; const c = html.querySelector('#useVecu'); if (c) c.checked = false; }
    });
  }

  displayRange(curseur) {
    const html = this.contenu;
    const cible = html.querySelector(`[data-display-range="${curseur.id}"]`);
    const option = curseur.list ? curseur.list.querySelector(`option[value="${curseur.value}"]`) : null;
    if (cible) cible.innerHTML = option ? option.innerHTML : curseur.value;
  }
}
