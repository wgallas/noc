import { nocUtility } from "../noc-utility.js";

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
  const caseReserve = (id, texte, n) => `<label class="case-option ${n ? "" : "indisponible"}"><input type="checkbox" id="${id}" ${rollData[id] ? "checked" : ""} ${n ? "" : "disabled"}/>
    <span>${texte}</span> <span class="ligne-grise">(${n} disponible${n > 1 ? "s" : ""})</span></label>`;
  html += caseReserve("useEspoirCabale", "1 point d'Espoir de la cabale (+3 dés)", Number(c.espoir) || 0);
  html += caseReserve("useVecuCabale", "1 point de Vécu de la cabale (+1 niveau de talent)", Number(c.vecu) || 0);
  return html + "</div>";
}

export class nocRollDialog extends Dialog {

  /* -------------------------------------------- */
  static async create(actor, rollData) {

    let options = { classes: ["nocDialog"], width: 420, height: 'fit-content', 'z-index': 99999 };
    rollData.cabaleHtml = htmlCabale(rollData);
    let html = await renderTemplate('systems/noc/templates/window_app/dialog-roll-generic.hbs', rollData);
    delete rollData.cabaleHtml;

    return new nocRollDialog(actor, rollData, html, options);
  }

  /* -------------------------------------------- */
  constructor(actor, rollData, html, options, close = undefined) {
    let conf = {
      title: "",
      content: html,
      buttons: {
        roll: {
          icon: '<i class="fas fa-check"></i>',
          label: "Lancer !",
          callback: () => { this.roll() }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Annuler",
          callback: () => { this.close() }
        }
      },
      close: close
    }

    super(conf, options);

    this.actor = actor;
    this.rollData = rollData;
  }

  /* -------------------------------------------- */
  roll() {
    nocUtility.roll(this.rollData)
  }

  /* -------------------------------------------- */
  async refreshDialog() {
    const content = await renderTemplate("systems/noc/templates/dialog-roll-generic.hbs", this.rollData)
    this.data.content = content
    this.render(true)
  }

  /* -------------------------------------------- */
  updateNiveauFinal() {
    let inputs = this._element.find('input');
    for (let input of inputs) {
      if (input.type === "range") {
        this.rollData[input.id] = Number(input.value)
      } if (input.type === "checkbox") {
        this.rollData[input.id] = input.checked
      }
    }
    if (this.rollData.arme) {
      const r = this.rollData;
      const distance = r.arme.system.adistance;
      r.niveauFinalRequis = (Number(r.niveauBase) || 0) + (Number(r.modMaitrise) || 0)
        + (distance ? (Number(r.modDistance) || 0) + (Number(r.modCouvert) || 0) : 0)
        + (Number(r.modVisibilite) || 0)
        + (r.cibleAuSol ? (distance ? 1 : -1) : 0)
        + (Number(r.modSupplement) || 0);
    } else if (this.rollData.niveauRequis !== undefined) {
      this.rollData.niveauFinalRequis = (Number(this.rollData.niveauRequis) || 0) + (Number(this.rollData.modCouvert) || 0) + (Number(this.rollData.modSupplement) || 0)
    }
    this._element.find('#niveauFinalRequis').html(this.rollData.niveauFinalRequis);
  }
  /* -------------------------------------------- */
  activateListeners(html) {
    super.activateListeners(html);

    var dialog = this;
    function onLoad() {
      dialog.updateNiveauFinal()
    }
    $(function () { onLoad(); });

    // un seul point d'Espoir et un seul point de Vécu par jet : celui du Héros ou celui de la cabale
    html.find('#useEspoir').change((event) => {
      this.rollData.useEspoir = event.currentTarget.checked
      if (this.rollData.useEspoir) { this.rollData.useEspoirCabale = false; html.find('#useEspoirCabale').prop('checked', false) }
    })
    html.find('#useVecu').change((event) => {
      this.rollData.useVecu = event.currentTarget.checked
      if (this.rollData.useVecu) { this.rollData.useVecuCabale = false; html.find('#useVecuCabale').prop('checked', false) }
    })
    html.find('#cibleAuSol').change((event) => {
      this.rollData.cibleAuSol = event.currentTarget.checked
      this.updateNiveauFinal()
    })
    html.find('#nbDesDomaine').change((event) => {
      this.rollData.nbDesDomaine = Number(event.currentTarget.value)
    })
    this.activerCabale(html)
    // bonus collaboratif : boutons +/- (minimum 0)
    html.find('a.bouton-collaboratif').click((event) => {
      const ecart = Number(event.currentTarget.dataset.ecart) || 0;
      const valeur = Math.max(0, (Number(this.rollData.nbBonusCollaboratif) || 0) + ecart);
      this.rollData.nbBonusCollaboratif = valeur;
      html.find('#nbBonusCollaboratif').html(valeur > 0 ? `+${valeur}` : "0");
    })
    html.find('#modDistance, #modVisibilite').change(() => this.updateNiveauFinal())
    html.find('#modCouvert').change((event) => {
      this.rollData.modCouvert = Number(event.currentTarget.value)
      this.updateNiveauFinal()
    })
    html.find('#modSupplement').change((event) => {
      this.rollData.modSupplement = Number(event.currentTarget.value)
      this.updateNiveauFinal()
    })
    html.find('input[type="range"]').change((ev) => {
      this.displayRange(ev)
    })

  }
  /** Bloc de la cabale : choix de la cabale, dés, Atouts, Espoir et Vécu communs */
  activerCabale(html) {
    const r = this.rollData
    const rafraichir = () => {
      html.find('.bloc-cabale').html(htmlCabale(r))
      this.setPosition({ height: "auto" })
    }
    html.on('change', '#cabaleChoice', (event) => {
      const cabale = (r.cabales ?? []).find(c => c.id === event.currentTarget.value)
      if (!cabale) return
      r.cabaleData = cabale
      r.cabaleDomaine = cabale.domaines?.[r.domaineId] ? foundry.utils.duplicate(cabale.domaines[r.domaineId]) : null
      r.nbDesCabale = 0
      r.atoutsCabale = {}
      r.uniteCabale = 0
      r.useEspoirCabale = false
      r.useVecuCabale = false
      rafraichir()
    })
    html.on('input change', '#nbDesCabale', (event) => {
      r.nbDesCabale = Number(event.currentTarget.value) || 0
      html.find('[data-display-range="nbDesCabale"]').html(String(r.nbDesCabale))
    })
    html.on('change', 'input.support-cabale', (event) => {
      r.atoutsCabale ??= {}
      r.atoutsCabale[event.currentTarget.dataset.atout] = event.currentTarget.checked ? 1 : 0
    })
    html.on('click', 'a.bouton-atout', (event) => {
      const cle = event.currentTarget.dataset.atout
      const atout = (r.cabaleData?.atouts ?? []).find(a => a.cle === cle)
      if (!atout) return
      r.atoutsCabale ??= {}
      const valeur = (Number(r.atoutsCabale[cle]) || 0) + (Number(event.currentTarget.dataset.ecart) || 0)
      r.atoutsCabale[cle] = Math.max(0, Math.min(Number(atout.restant) || 0, valeur))
      rafraichir()
    })
    html.on('change', 'input.unite-cabale', (event) => {
      r.uniteCabale = event.currentTarget.checked ? Number(event.currentTarget.dataset.bonus) || 0 : 0
    })
    html.on('change', '#useEspoirCabale', (event) => {
      r.useEspoirCabale = event.currentTarget.checked
      if (r.useEspoirCabale) { r.useEspoir = false; html.find('#useEspoir').prop('checked', false) }
    })
    html.on('change', '#useVecuCabale', (event) => {
      r.useVecuCabale = event.currentTarget.checked
      if (r.useVecuCabale) { r.useVecu = false; html.find('#useVecu').prop('checked', false) }
    })
  }

  displayRange(ev) {
    let displayTarget = this._element.find(`[data-display-range=${ev.currentTarget.id}]`)[0];
    let option = this._element.find(`#${ev.currentTarget.list.id} option[value="${ev.currentTarget.value}"]`)[0];
    displayTarget.innerHTML = option.innerHTML
  }
}