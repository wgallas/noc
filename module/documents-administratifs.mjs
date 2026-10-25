/**
 * Documents administratifs (formulaires du Bureau).
 *
 * Le type de formulaire (system.formulaire) détermine la description générale,
 * le Rang du document et les options propres au formulaire.
 * Les Niveaux de Bureau investis et le temps d'obtention sont recalculés à
 * l'affichage à partir des options choisies.
 * Textes : reformulations du livre de base (dépôt public).
 */

export const FORMULAIRES = {
  port: {
    label: "Autorisation de port",
    description: "Chaque bénéficiaire peut porter un objet doté du trait Limité (X), où X est égal au Rang du demandeur. L'objet est désigné au moment où le formulaire est établi."
  },
  acces: {
    label: "Autorisation d'accès",
    description: "Les bénéficiaires peuvent entrer dans une zone à accès limité, pour un motif déclaré. La visite reste cantonnée aux secteurs prévus et se déroule sous la surveillance de trois membres du personnel ou gardes. Le Rang requis dépend de la zone."
  },
  sortie: {
    label: "Autorisation de sortie",
    description: "Les bénéficiaires peuvent quitter une zone limitée, pour un motif déclaré, après les examens sanitaires obligatoires (un cycle de démarches). Le séjour dehors ne dépasse pas la durée du formulaire, sauf extension. Le Rang requis dépend de la zone."
  },
  requisition: {
    label: "Réquisition",
    description: "Le demandeur mobilise à son profit des ressources officielles : un objet ou un capital, un expert missionné par le Bureau, ou une escorte de Gardes Noirs. Ce qui est perdu ou abîmé, et tout comportement suspect observé, se paie en Traque."
  },
  mandat: {
    label: "Mandat d'investigation",
    description: "Les bénéficiaires peuvent enquêter sur un sujet précis dans un secteur du Bloc. Le mandat a un niveau d'autorité égal au Rang du demandeur : il oblige un citoyen de Rang inférieur à répondre aux questions, et permet de fouiller les affaires et le domicile d'un citoyen dont le Rang est inférieur d'au moins 2 à cette autorité."
  },
  signalement: {
    label: "Fiche de signalement",
    description: "Procédure contre un citoyen de Rang inférieur, qui sait qui le vise. Au bout d'un cycle, le demandeur et la cible confrontent leur Rang : le gagnant inflige une nuisance par succès de marge. Les autorités s'intéressent aussi au demandeur : sa Façade baisse de 1 en usage passif jusqu'à la fin de l'aventure."
  },
  autre: {
    label: "Autre document",
    description: "Document sans effet de règle particulier (certificat, carte, titre d'attribution…). Décrivez-le ci-dessous."
  }
};

export const ZONES_ACCES = {
  1: "Bureaux interdits au public",
  2: "Secteur aux données confidentielles",
  3: "Zone de quarantaine ou militaire",
  4: "Secteur aux données secrètes"
};

export const ZONES_SORTIE = {
  3: "Zone de quarantaine",
  4: "Sortie du Bloc"
};

export const DUREES_SORTIE = {
  formulaire: { label: "Durée du formulaire", rang: 0 },
  mois: { label: "Un mois (Rang +1)", rang: 1 },
  illimitee: { label: "Sans limite de durée (Rang +2)", rang: 2 }
};

export const MODES_REQUISITION = {
  objet: "Objet",
  capital: "Capital (fonds)",
  expert: "Expert",
  escorte: "Escorte"
};

export const NUISANCES = [
  { nom: "Surcharge de travail", texte: "1 Trauma et 1 Blessure par succès de marge investi." },
  { nom: "Interdiction", texte: "ne peut approcher un lieu, un objet ou une personne." },
  { nom: "Sanction professionnelle", texte: "Rang −1." },
  { nom: "Amende", texte: "Fortune −1." },
  { nom: "Signalé", texte: "Façade −1." },
  { nom: "Arrestation", texte: "2 succès minimum : interrogé un quart ; emprisonné un cycle (3), un mois (4) ou définitivement (5)." }
];

const nombre = v => Number(v) || 0;

/** Bénéficiaires sous forme de liste (l'ancien format était un simple texte) */
export function listeBeneficiaires(system) {
  const b = system?.beneficiaires;
  let liste = Array.isArray(b) ? [...b] : (typeof b === "string" && b ? [b] : []);
  liste = liste.map(x => String(x ?? ""));
  while (liste.length < 2) liste.push("");
  return liste;
}

/** Rang du héros qui porte le document (1 si le document n'a pas de porteur) */
export function rangDuPorteur(item) {
  const niveau = item.actor?.system?.talents?.statut?.rang?.niveau;
  return item.actor && niveau !== undefined ? nombre(niveau) : 1;
}

/** Tous les calculs affichés par la fiche */
export function calculerDocument(item) {
  const s = item.system;
  const type = FORMULAIRES[s.formulaire] ? s.formulaire : "autre";
  const beneficiaires = listeBeneficiaires(s);
  const rangBase = rangDuPorteur(item);
  const rangSup = nombre(s.rangSup);
  const rang = rangBase + rangSup;
  const duree = Math.max(1, nombre(s.duree) || 1);
  // formulaire possédé à la création du personnage : durée permanente, sans coût de durée
  const permanent = !!s.permanent;

  // Effets de Bureau : [libellé, niveaux]
  const effets = [];
  const ajouter = (label, niveaux) => { if (niveaux > 0) effets.push({ label, niveaux }); };
  ajouter(`Outrepasser son Rang (+${rangSup})`, 2 * rangSup);
  if (!permanent) ajouter(`Durée (+${duree - 1} cycle${duree > 2 ? "s" : ""})`, duree - 1);
  ajouter(`Bénéficiaires (+${Math.max(0, beneficiaires.length - 2)})`, Math.max(0, beneficiaires.length - 2));

  const calc = { type, rangBase, rangSup, rang, duree, permanent, beneficiaires, porteur: !!item.actor };
  let rangDocument = rang;

  switch (type) {
    case "port": {
      const bonus = nombre(s.port?.bonusX);
      calc.limiteX = rang + bonus;
      ajouter(`Limité (X) +${bonus}`, bonus);
      break;
    }
    case "acces": {
      const zone = Math.min(4, Math.max(1, nombre(s.acces?.zone) || 1));
      rangDocument = zone;
      if (s.acces?.nonLimite) ajouter("Circulation non limitée à un secteur", 1);
      if (s.acces?.sansSurveillance) ajouter("Circulation sans surveillance", 2);
      break;
    }
    case "sortie": {
      const zone = nombre(s.sortie?.zone) === 4 ? 4 : 3;
      rangDocument = zone + (DUREES_SORTIE[s.sortie?.duree]?.rang ?? 0);
      if (s.sortie?.exoneration) ajouter("Exonération des examens de sortie", 1);
      break;
    }
    case "requisition": {
      calc.valeurMax = rang;
      calc.capital = rang + 1;
      calc.niveauExpert = rang + 1;
      calc.gardes = rang;
      break;
    }
    case "mandat": {
      const bonusA = nombre(s.mandat?.bonusAutorite);
      const bonusC = nombre(s.mandat?.bonusCitoyens);
      calc.autorite = rang + bonusA;
      calc.citoyens = 1 + bonusC;
      calc.rangInterrogation = calc.autorite - 1;
      calc.rangFouille = calc.autorite - 2;
      ajouter(`Niveau d'autorité +${bonusA}`, 2 * bonusA);
      ajouter(`Citoyens visés +${bonusC}`, bonusC);
      break;
    }
    case "signalement": {
      if (s.signalement?.bonusStatut) ajouter("+1 au Domaine Statut pour la confrontation", 1);
      if (s.signalement?.priseRapide) ajouter("Prise d'effet en un quart", 1);
      calc.delai = s.signalement?.priseRapide ? "un quart" : "un cycle";
      break;
    }
  }

  calc.formulaire = type !== "autre";
  calc.rangDocument = rangDocument;
  calc.rangInsuffisant = calc.formulaire && rang < rangDocument;
  calc.effets = effets;
  calc.niveauxBureau = effets.reduce((t, e) => t + e.niveaux, 0);
  calc.heures = 3 + 2 * effets.length;
  return calc;
}

/* -------------------------------------------- */
/*  Documents délivrés : numéro, papier, validité */
/* -------------------------------------------- */

const PREFIXES = { port: "AP", acces: "AA", sortie: "AS", requisition: "RQ", mandat: "MI", signalement: "FS", autre: "DA" };

/** Numéro de série administratif, ex. « AP-37K-0412 » */
export function numeroDocument(type) {
  const lettres = "ABCDEFGHJKLMNPRSTUVXZ";
  const hasard = n => Math.floor(Math.random() * n);
  const milieu = `${hasard(90) + 10}${lettres[hasard(lettres.length)]}`;
  return `${PREFIXES[type] ?? "DA"}-${milieu}-${String(hasard(10000)).padStart(4, "0")}`;
}

/** Cycle courant du monde (avancé par le bouton « Nouveau cycle » du MJ) */
export function cycleCourant() {
  try { return nombre(game.settings.get("noc", "cycleCourant")); } catch (e) { return 0; }
}

export function estDelivre(item) {
  return item?.type === "document administratif" && item.system?.statut === "delivre";
}

/** Document permanent (possédé à la création du personnage) */
export function estPermanent(item) {
  return item?.type === "document administratif" && !!item.system?.permanent;
}

/** Document en vigueur : délivré par le Bureau ou permanent */
export function estEnVigueur(item) {
  return estDelivre(item) || estPermanent(item);
}

/** Validité : { permanent } ou { duree, restants, perime } pour un document délivré (null sinon) */
export function validite(item) {
  if (estPermanent(item)) return { permanent: true, perime: false, restants: null, duree: null };
  if (!estDelivre(item)) return null;
  const duree = Math.max(1, nombre(item.system.duree) || 1);
  const restants = nombre(item.system.delivre?.cycle) + duree - cycleCourant();
  return { duree, restants: Math.max(0, restants), perime: restants <= 0 };
}

/** Bénéficiaires non vides */
export function nomsBeneficiaires(system) {
  return listeBeneficiaires(system).map(n => n.trim()).filter(Boolean);
}

/** Données d'affichage du « papier » d'un document */
export function donneesPapier(item) {
  const c = calculerDocument(item);
  const s = item.system;
  const lignes = [];
  const ajouter = (label, valeur) => { if (valeur !== undefined && valeur !== null && valeur !== "") lignes.push({ label, valeur }); };
  switch (c.type) {
    case "port":
      ajouter("Objet autorisé", s.port?.objet || "—");
      ajouter("Limité (X)", c.limiteX);
      break;
    case "acces":
      ajouter("Zone", ZONES_ACCES[s.acces?.zone ?? 1]);
      ajouter("Motif", s.acces?.motif);
      ajouter("Circulation", [s.acces?.nonLimite ? "non limitée à un secteur" : "secteurs définis", s.acces?.sansSurveillance ? "sans surveillance" : "sous surveillance"].join(", "));
      break;
    case "sortie":
      ajouter("Zone", ZONES_SORTIE[nombre(s.sortie?.zone) === 4 ? 4 : 3]);
      ajouter("Séjour", DUREES_SORTIE[s.sortie?.duree]?.label.replace(/\s*\(.*\)/, ""));
      ajouter("Motif", s.sortie?.motif);
      if (s.sortie?.exoneration) ajouter("Examens de sortie", "exonéré");
      break;
    case "requisition":
      ajouter("Ressource", MODES_REQUISITION[s.requisition?.mode || "objet"]);
      ajouter("Détail", s.requisition?.detail);
      if ((s.requisition?.mode || "objet") === "objet") ajouter("Valeur maximale", c.valeurMax);
      if (s.requisition?.mode === "capital") ajouter("Capital", c.capital);
      if (s.requisition?.mode === "expert") ajouter("Niveau de l'expert", c.niveauExpert);
      if (s.requisition?.mode === "escorte") ajouter("Gardes Noirs", c.gardes);
      break;
    case "mandat":
      ajouter("Sujet", s.mandat?.sujet);
      ajouter("Secteur", s.mandat?.secteur);
      ajouter("Niveau d'autorité", c.autorite);
      ajouter("Citoyens visés", c.citoyens);
      break;
    case "signalement":
      ajouter("Citoyen visé", s.signalement?.cible);
      ajouter("Prise d'effet", c.delai);
      if (s.signalement?.bonusStatut) ajouter("Confrontation", "+1 au Domaine Statut");
      break;
  }
  const v = validite(item);
  return {
    uuid: item.uuid,
    nom: item.name,
    type: FORMULAIRES[c.type].label,
    numero: s.numero || "—",
    titulaire: item.actor?.name ?? s.delivre?.par ?? "",
    beneficiaires: nomsBeneficiaires(s),
    lignes,
    specificites: s.description || "",
    rangDocument: c.rangDocument,
    delivre: estDelivre(item) ? { cycle: nombre(s.delivre?.cycle), par: s.delivre?.par || "" } : null,
    permanent: estPermanent(item),
    valide: estEnVigueur(item),
    validite: v
  };
}

/** Tous les documents délivrés du monde (acteurs du monde) */
export function documentsDelivres() {
  return game.actors.contents.flatMap(a => a.itemTypes?.["document administratif"] ?? []).filter(estDelivre);
}

/** Tous les documents en vigueur du monde : délivrés ou permanents */
export function documentsEnVigueur() {
  return game.actors.contents.flatMap(a => a.itemTypes?.["document administratif"] ?? []).filter(estEnVigueur);
}

/** Documents dont un personnage est bénéficiaire sans en être le titulaire */
export function documentsRecus(actor) {
  const nom = String(actor?.name ?? "").trim().toLowerCase();
  if (!nom) return [];
  return documentsEnVigueur().filter(d => d.actor?.id !== actor.id
    && nomsBeneficiaires(d.system).some(n => n.toLowerCase() === nom));
}

/** MJ : passe au cycle suivant et signale les documents qui viennent d'expirer */
export async function nouveauCycle() {
  if (!game.user.isGM) return;
  const cycle = cycleCourant() + 1;
  await game.settings.set("noc", "cycleCourant", cycle);
  const expires = documentsDelivres().filter(d => !estPermanent(d)).filter(d => {
    const fin = nombre(d.system.delivre?.cycle) + Math.max(1, nombre(d.system.duree) || 1);
    return fin === cycle;
  });
  const lignes = expires.map(d => {
    const rappel = d.system.formulaire === "requisition"
      ? " — à restituer (sinon 1 séquelle de Traque par tranche de 2 niveaux de valeur perdus)" : "";
    return `<li><strong>${d.name}</strong> (${d.system.numero || "—"}), détenu par ${d.actor?.name ?? "?"}${rappel}</li>`;
  }).join("");
  await ChatMessage.create({
    content: `<div class="nocRoll"><h4>Cycle ${cycle}</h4>${expires.length
      ? `<p>Documents arrivés à expiration :</p><ul>${lignes}</ul>` : "<p>Aucun document n'arrive à expiration.</p>"}</div>`,
    speaker: ChatMessage.getSpeaker({ alias: "Bureau" })
  });
}
