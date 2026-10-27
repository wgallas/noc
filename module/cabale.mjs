/**
 * Cabales (règles avancées, p. 112-125).
 *
 * - Domaines : réserves de dés de Destin dans lesquelles les membres puisent ;
 *   rechargées au début de chaque scénario. Le score reste intact : on compte les dés dépensés.
 * - Atouts de support : réserve de points égale au niveau ; 1 point = +1 au Talent lié
 *   (Capital : plusieurs points). Rechargés au début de chaque scénario.
 * - Réserves communes : Singularité (Observatoire), Espoir (Credo), Vécu (Légende + achats),
 *   Faveurs (2 par Contact du Réseau). Rechargées au début de chaque scénario.
 * - Jauges : Dégradation, Division, Noirceur, Traque, avec leurs effets à 5, 8 et 10.
 * - Standing : nombre d'Atouts différents au niveau 1 ou plus (Standing lui-même non compté) = Standing + 3.
 * - Faille : tout Atout au niveau −1.
 */
import { raisonSommeil } from "./sommeil.mjs";

const nombre = v => Number(v) || 0;

/* -------------------------------------------- */
/*  Atouts                                       */
/* -------------------------------------------- */

/**
 * type : "support" (points pour +1 au Talent lié), "capital" (support, plusieurs points),
 *        "usages" (utilisations par scénario), "conditionnel" (bonus de situation)
 * support : précision quand le support ne vaut que dans un cas
 */
export const ATOUTS = {
  bibliotheque: { domaine: "erudition", label: "Bibliothèque", talent: "culture", talentLabel: "Culture", type: "support",
    effet: "Fonds documentaire ordonné, parfois des textes interdits de l'Avant.",
    faille: "Némésis (bibliothèques et musées officiels)" },
  fichier: { domaine: "erudition", label: "Fichier", talent: "bureau", talentLabel: "Bureau", type: "support",
    effet: "Archives et dossiers dérobés. Consulter le Fichier sur un citoyen (une fois par citoyen, 1 heure) : autant de dés de Destin que le niveau, une donnée personnelle par succès.",
    faille: "Némésis (Census et Division du Fichier)" },
  laboratoire: { domaine: "erudition", label: "Laboratoire", talent: "recherche", talentLabel: "Recherche", type: "support",
    effet: "Matériel de détection, de prélèvement et d'analyse, chambre froide, table d'autopsie.",
    faille: "Némésis (Bureau d'investigation)" },
  informateurs: { domaine: "erudition", label: "Informateurs", talent: "societe", talentLabel: "Société", type: "support",
    effet: "Un réseau tient la Cabale au courant de la vie du Bloc ; la Loi peut s'en servir pour donner des pistes.",
    faille: "Némésis (presse officielle)" },

  passages: { domaine: "technique", label: "Passages", talent: "survie", talentLabel: "Survie", type: "usages",
    effet: "Trajets dans le Bloc divisés par 1 + niveau. Autant de fois par scénario que le niveau : un déplacement sans patrouilles ni espions.",
    faille: "Némésis (peuple de l'Hypogée)" },
  atelier: { domaine: "technique", label: "Atelier", talent: "artisanat", talentLabel: "Artisanat", type: "support",
    effet: "Entrepôt outillé pour les objets lourds, encombrants ou dangereux ; son niveau s'ajoute aux réparations de la Cabale.",
    faille: "Capharnaüm : recourir aux atouts de support prend deux fois plus de temps (+50 % d'étapes)" },
  salleBlanche: { domaine: "technique", label: "Salle blanche", talent: "ingenierie", talentLabel: "Ingénierie", type: "support",
    effet: "Atmosphère maîtrisée pour la haute technologie ; son niveau réduit la Noirceur due aux objets corrompus entreposés.",
    faille: "Corrosion : à chaque intermède, une machine ou arme entreposée se dérègle (malus de 1)" },
  observatoire: { domaine: "technique", label: "Observatoire", talent: "artefact", talentLabel: "Artefact", type: "reserve",
    effet: "Instruments braqués sur l'Artefact : réserve commune de Singularité égale au niveau.",
    faille: "Mépris de l'Artefact : à chaque séance, le premier 1 sur un dé de Destin donne 2 gouttes de Fiel" },

  armurerie: { domaine: "action", label: "Armurerie", talent: "combat", talentLabel: "Combat", type: "",
    effet: "5 armes par niveau, choisies parmi celles dont le trait Limité ne dépasse pas le niveau.",
    faille: "Armes identifiées : +1 Traque en fin de scène pour qui s'en est servi" },
  vehicules: { domaine: "action", label: "Véhicule", talent: "deplacement", talentLabel: "Déplacement", type: "",
    effet: "Un véhicule ou équipement de mobilité par niveau (certains en coûtent deux).",
    faille: "Véhicules identifiés : +1 Traque en fin de scène pour qui s'en est servi" },
  niveauAcces: { domaine: "action", label: "Niveau d'accès", talent: "instinct", talentLabel: "Instinct", type: "",
    effet: "Le niveau s'ajoute à la difficulté pour espionner ou infiltrer la Cabale ; un échec est repéré et renseigne les membres.",
    faille: "Brèche : difficulté d'infiltration ou d'espionnage −1" },
  fortifications: { domaine: "action", label: "Fortifications", talent: "constitution", talentLabel: "Constitution", type: "",
    effet: "Réduit la Dégradation subie (puis perd 1 point, regagné à la réparation complète). La Cabale combat comme un Rouage : Action, Instinct, Combat et Constitution au niveau de l'Atout.",
    faille: "Vulnérable : Initiative et Déplacement −1 pour les membres qui s'y battent" },

  capital: { domaine: "statut", label: "Capital", talent: "fortune", talentLabel: "Fortune", type: "capital",
    effet: "Trésor et revenus. Plusieurs points peuvent être dépensés à la fois pour préparer Fortune.",
    faille: "Endettée : une dépense de niveau 4 par aventure, sinon un membre perd 1 point de progression" },
  standing: { domaine: "statut", label: "Standing", talent: "rang", talentLabel: "Rang", type: "",
    effet: "Taille et confort du quartier général ; nombre d'Atouts différents au niveau 1 ou plus (sans compter le Standing) : Standing + 3.",
    faille: "Sans quartier général : réunions chez les membres ou dans des lieux publics" },
  reseau: { domaine: "statut", label: "Réseau", talent: "contact", talentLabel: "Contacts", type: "reserve",
    effet: "Un Contact par niveau, chacun avec 2 Faveurs, à la disposition de tous les membres.",
    faille: "Mauvaise réputation : +1 Faveur pour les services des contacts qui connaissent l'appartenance à la Cabale" },
  societesEcrans: { domaine: "statut", label: "Sociétés écrans", talent: "façade", talentLabel: "Façade", type: "support", support: "Façade passive",
    effet: "Une société écran par niveau, avec faux papiers ; réduit du niveau la Traque subie par la Cabale.",
    faille: "Némésis (Direction de l'Effort)" },

  musee: { domaine: "ame", label: "Musée", talent: "sensibilite", talentLabel: "Sensibilité", type: "support",
    effet: "Objets étranges et œuvres dérangées, qui peuvent annoncer des événements occultes.",
    faille: "Hantée : à la 5e goutte de Fiel cumulée dans la Cabale, un effet de Fiel de plus" },
  chambreInterrogatoire: { domaine: "ame", label: "Chambre d'interrogatoire", talent: "tenebres", talentLabel: "Ténèbres", type: "",
    effet: "Interroger un Rouage : l'interrogateur subit de 1 à Ténèbres points de Noirceur ; si niveau de l'Atout + Noirceur dépasse la Conviction de la cible, elle craque (une question par niveau de marge).",
    faille: "Souillée : +1 Noirceur et +1 Trauma pour les actes violents ou cruels dans les locaux" },
  fragmentsVerite: { domaine: "ame", label: "Fragments de vérité", talent: "folie", talentLabel: "Folie", type: "support", support: "Folie contre le Trauma surnaturel",
    effet: "Face à l'occulte, étudier le Fragment : de 1 à niveau dés de Destin, un renseignement par succès.",
    faille: "Sceptique : +1 aux pertes de Trauma dues à l'occulte" },
  refuge: { domaine: "ame", label: "Refuge", talent: "extase", talentLabel: "Extase", type: "",
    effet: "Moment de calme au refuge : les Héros se partagent un nombre de points d'Espoir supplémentaires égal au niveau.",
    faille: "Angoissante : pas d'Espoir regagné au calme dans les locaux" },

  faussesIdentites: { domaine: "social", label: "Fausses identités", talent: "tromperie", talentLabel: "Tromperie", type: "",
    effet: "Chaque membre a autant de fausses identités que le niveau ; elles trompent un Bureau inférieur ou égal au niveau.",
    faille: "Visible : pas de Traque récupérée au calme dans les locaux" },
  personnel: { domaine: "social", label: "Personnel", talent: "charisme", talentLabel: "Charisme", type: "",
    effet: "Deux sympathisants fidèles par niveau (Rouages mineurs).",
    faille: "Suspecte : Némésis (quartier ou village)" },
  expert: { domaine: "social", label: "Expert", talent: "psychologie", talentLabel: "Psychologie", type: "",
    effet: "Un expert fidèle par niveau (Rouage majeur).",
    faille: "Ennemis : Némésis (dissidence)" },
  unite: { domaine: "social", label: "Unité", talent: "conviction", talentLabel: "Conviction", type: "conditionnel",
    effet: "Le niveau s'ajoute à la Conviction des membres pour résister à ce qui vise à leur faire trahir la Cabale.",
    faille: "Démotivation : −1 en Conviction dans ces mêmes cas" },

  asile: { domaine: "vie", label: "Asile", talent: "apaisement", talentLabel: "Apaisement", type: "support",
    effet: "Installations et matériel pour traiter les troubles psychiques.",
    faille: "Sordide : pas de Trauma récupéré au calme dans les locaux" },
  infirmerie: { domaine: "vie", label: "Infirmerie", talent: "soins", talentLabel: "Soins", type: "support",
    effet: "Chambres, salle d'opération et médicaments pour les blessures et maladies.",
    faille: "Contaminée : pas de Blessures récupérées au calme dans les locaux" },
  credo: { domaine: "vie", label: "Credo", talent: "ferveur", talentLabel: "Ferveur", type: "reserve",
    effet: "Une foi commune : réserve commune d'Espoir égale au niveau.",
    faille: "Doute : on ne donne de l'Espoir à un allié qu'au contact" },
  legendes: { domaine: "vie", label: "Légende", talent: "lumiere", talentLabel: "Lumière", type: "reserve",
    effet: "Une histoire et des exploits : réserve commune de Vécu égale au niveau.",
    faille: "Enténébrée : pas de Noirceur récupérée au calme dans les locaux" }
};

/** Réserves communes et Atout qui les fournit */
export const RESERVES_CABALE = {
  espoir: { atout: "credo", label: "Espoir" },
  vecu: { atout: "legendes", label: "Vécu" },
  singularite: { atout: "observatoire", label: "Singularité" },
  faveurs: { atout: "reseau", label: "Faveurs", parNiveau: 2 }
};

/** Jauges de la Cabale : nom et effets par palier */
export const JAUGES_CABALE = {
  blessures: { label: "Dégradation", paliers: {
    5: { label: "endommagée", description: "Les Atouts ne servent plus jusqu'à réparation." },
    8: { label: "partiellement détruite", description: "Un Atout perd définitivement 1 niveau ; les Atouts ne servent plus jusqu'à réparation." },
    10: { label: "détruite", description: "Tous les Atouts sont perdus. Un Héros peut sacrifier définitivement un niveau de Ferveur : la Cabale reste alors à 9." } } },
  trauma: { label: "Division", paliers: {
    5: { label: "désunie", description: "Les membres ne donnent plus d'Espoir à leurs alliés et n'en regagnent plus au calme." },
    8: { label: "vacillante", description: "Les membres ne récupèrent plus d'Espoir ni de Trauma au calme." },
    10: { label: "divisée", description: "Les membres ne récupèrent plus d'Espoir, de Trauma ni de Noirceur au calme." } } },
  noirceur: { label: "Noirceur", paliers: {
    5: { label: "sinistre", description: "Le Fiel des Héros ne descend plus sous 1 goutte." },
    8: { label: "sinistre", description: "Le Fiel des Héros ne descend plus sous 2 gouttes." },
    10: { label: "sinistre", description: "Le Fiel des Héros ne descend plus sous 3 gouttes." } } },
  traque: { label: "Traque", paliers: {
    5: { label: "suspectée", description: "Les Héros subissent 1 point de Traque à chaque visite des locaux." },
    8: { label: "scrutée", description: "Les Héros subissent 2 points de Traque à chaque visite des locaux." },
    10: { label: "révélée", description: "Les Héros subissent 1 point de Traque par cycle." } } }
};

export function palierCabale(valeur) {
  const v = nombre(valeur);
  return v >= 10 ? 10 : v >= 8 ? 8 : v >= 5 ? 5 : 0;
}

const estSupport = def => def?.type === "support" || def?.type === "capital";
const aPoints = def => estSupport(def) || def?.type === "usages";

/* -------------------------------------------- */
/*  Préparation des données                      */
/* -------------------------------------------- */

/** Données calculées d'une cabale (appelé à la préparation de l'acteur) */
export function preparerCabale(actor) {
  if (actor.type !== "cabale") return;
  const s = actor.system;
  const dep = s.depenses ?? {};
  // domaines : score et dés restants
  for (const [cle, d] of Object.entries(s.domaines ?? {})) {
    d.score = Math.max(0, nombre(d.value));
    d.restant = Math.max(0, d.score - nombre(dep.domaines?.[cle]));
  }
  // atouts
  let possedes = 0;
  const failles = [];
  for (const [domaine, liste] of Object.entries(s.talents ?? {})) {
    for (const [cle, t] of Object.entries(liste ?? {})) {
      const def = ATOUTS[cle];
      t.niveau = nombre(t.niveau);
      if (def) {
        t.label = def.label;
        t.def = def;
      }
      // le Standing fixe la limite : il n'est pas compté parmi les Atouts possédés
      if (t.niveau >= 1 && cle !== "standing") possedes++;
      if (t.niveau <= -1 && def) failles.push({ cle, label: def.label, faille: def.faille });
      if (aPoints(def)) {
        t.points = Math.max(0, t.niveau);
        t.restant = Math.max(0, t.points - nombre(dep.atouts?.[cle]));
      }
    }
  }
  // Fortifications : diminue de 1 à chaque sollicitation, regagné à la réparation complète
  const fort = nombre(s.talents?.action?.fortifications?.niveau);
  s.fortificationsRestant = Math.max(0, Math.max(0, fort) - nombre(dep.fortifications));
  // réserves communes tirées des Atouts
  for (const [cle, r] of Object.entries(RESERVES_CABALE)) {
    const reserve = s.reserves?.[cle];
    if (!reserve) continue;
    const def = ATOUTS[r.atout];
    const niveau = Math.max(0, nombre(s.talents?.[def.domaine]?.[r.atout]?.niveau));
    reserve.label = r.label.toLowerCase();
    reserve.source = def.label;
    reserve.max = Math.min(10, niveau * (r.parNiveau ?? 1) + (cle === "vecu" ? nombre(s.vecuAchats) : 0));
    reserve.value = Math.max(0, Math.min(reserve.max, nombre(reserve.value)));
  }
  // jauges
  for (const [cle, j] of Object.entries(JAUGES_CABALE)) {
    const p = s.perditions?.[cle];
    if (!p) continue;
    p.label = j.label.toLowerCase();
    const etape = palierCabale(p.value);
    p.statut = etape ? { ...j.paliers[etape] } : { label: "", description: "" };
  }
  const standing = nombre(s.talents?.statut?.standing?.niveau);
  s.atoutsPossedes = possedes;
  s.limiteAtouts = Math.max(2, standing + 3);
  s.failles = failles;
  // Dégradation 5 ou plus : les Héros ne profitent plus des Atouts
  s.atoutsInutilisables = nombre(s.perditions?.blessures?.value) >= 5;
}

/* -------------------------------------------- */
/*  Membres                                      */
/* -------------------------------------------- */

/** Membres de la cabale (personnages du monde) */
export function membresCabale(cabale, { actifs = false } = {}) {
  return game.actors.filter(a => a.type === "personnage" && a.cabaleIds?.includes(cabale.id) && (!actifs || !raisonSommeil(a)));
}

/* -------------------------------------------- */
/*  Jets : ce qu'un membre peut puiser            */
/* -------------------------------------------- */

/** Ressources d'une cabale proposées pour le jet d'un Talent */
function ressourcesPourJet(cabale, domaineId, talentId) {
  const s = cabale.system;
  const inutilisables = !!s.atoutsInutilisables;
  const domaines = {};
  for (const [cle, d] of Object.entries(s.domaines ?? {})) domaines[cle] = { label: d.label, value: d.restant, score: d.score };
  // atouts liés au Talent du jet
  const atouts = [];
  for (const [cle, def] of Object.entries(ATOUTS)) {
    if (def.domaine !== domaineId || def.talent !== talentId) continue;
    const t = s.talents?.[def.domaine]?.[cle];
    if (!t) continue;
    if (estSupport(def) && t.points > 0) {
      atouts.push({ cle, label: def.label, type: def.type, restant: inutilisables ? 0 : t.restant, points: t.points,
        condition: def.support ?? "", max: def.type === "capital" ? t.restant : Math.min(1, t.restant) });
    } else if (def.type === "conditionnel" && t.niveau !== 0) {
      // Unité (bonus égal au niveau) ou sa faille Démotivation (−1)
      const bonus = t.niveau > 0 ? (inutilisables ? 0 : t.niveau) : -1;
      atouts.push({ cle, label: def.label, type: def.type, bonus, faille: t.niveau < 0,
        condition: "résister à une tentative de faire trahir la Cabale" });
    }
  }
  return {
    id: cabale.id, name: cabale.name, domaines, atouts, inutilisables,
    espoir: inutilisables ? 0 : nombre(s.reserves?.espoir?.value),
    vecu: inutilisables ? 0 : nombre(s.reserves?.vecu?.value)
  };
}

/** Cabales d'un personnage, avec ce qu'elles offrent pour ce jet */
export function cabalesPourJet(actor, domaineId, talentId) {
  if (actor.type !== "personnage") return [];
  return (actor.cabalesActeurs ?? []).map(c => ressourcesPourJet(c, domaineId, talentId));
}

/** Ce que le jet consomme dans la cabale (dés, points d'Atout, Espoir, Vécu) */
export async function depenserCabale(rollData) {
  const cabale = game.actors.get(rollData.cabaleData?.id);
  if (!cabale || rollData.cabaleDepensee) return;
  rollData.cabaleDepensee = true;
  const dep = cabale.system.depenses ?? {};
  const maj = {};
  const nbDes = nombre(rollData.nbDesCabale);
  if (nbDes > 0 && rollData.domaineId) {
    const restant = nombre(cabale.system.domaines?.[rollData.domaineId]?.restant);
    const pris = Math.min(nbDes, restant);
    maj[`system.depenses.domaines.${rollData.domaineId}`] = nombre(dep.domaines?.[rollData.domaineId]) + pris;
  }
  for (const [cle, pts] of Object.entries(rollData.atoutsCabale ?? {})) {
    const def = ATOUTS[cle];
    if (!estSupport(def) || nombre(pts) <= 0) continue;
    maj[`system.depenses.atouts.${cle}`] = nombre(dep.atouts?.[cle]) + nombre(pts);
  }
  if (rollData.useEspoirCabale) maj["system.reserves.espoir.value"] = Math.max(0, nombre(cabale.system.reserves.espoir.value) - 1);
  if (rollData.useVecuCabale) maj["system.reserves.vecu.value"] = Math.max(0, nombre(cabale.system.reserves.vecu.value) - 1);
  if (!Object.keys(maj).length) return;
  if (!cabale.isOwner) return ui.notifications.warn(`Vous n'avez pas les droits sur la cabale ${cabale.name} : demandez à la Loi d'y reporter la dépense.`);
  await cabale.update(maj);
}

/** Bonus de niveau apporté par la cabale (Atouts de support, Unité) */
export function bonusCabale(rollData) {
  let bonus = 0;
  for (const [cle, pts] of Object.entries(rollData.atoutsCabale ?? {})) {
    const def = ATOUTS[cle];
    if (estSupport(def)) bonus += nombre(pts);
  }
  if (rollData.uniteCabale) bonus += nombre(rollData.uniteCabale);
  return bonus;
}

/* -------------------------------------------- */
/*  Début de scénario                            */
/* -------------------------------------------- */

/** Recharge dés de Domaine, points d'Atouts et réserves d'une cabale ; renvoie true si quelque chose a changé */
export async function rechargerCabale(cabale) {
  const s = cabale.system;
  const maj = {};
  for (const cle of Object.keys(s.domaines ?? {})) if (nombre(s.depenses?.domaines?.[cle])) maj[`system.depenses.domaines.${cle}`] = 0;
  for (const cle of Object.keys(ATOUTS)) if (nombre(s.depenses?.atouts?.[cle])) maj[`system.depenses.atouts.${cle}`] = 0;
  for (const cle of Object.keys(RESERVES_CABALE)) {
    const r = s.reserves?.[cle];
    if (r && nombre(cabale._source.system.reserves?.[cle]?.value) !== nombre(r.max)) maj[`system.reserves.${cle}.value`] = nombre(r.max);
  }
  if (!Object.keys(maj).length) return false;
  await cabale.update(maj);
  return true;
}

/** Recharge toutes les cabales (début de scénario) */
export async function rechargerCabales() {
  const lignes = [];
  for (const cabale of game.actors.filter(a => a.type === "cabale")) {
    if (await rechargerCabale(cabale)) lignes.push(`${cabale.name} : dés de Domaine, Atouts et réserves rechargés`);
  }
  return lignes;
}

/* -------------------------------------------- */
/*  Dommages de la cabale                        */
/* -------------------------------------------- */

/**
 * Inflige (points > 0) ou retire (points < 0) des points dans une jauge de la cabale.
 * Réductions : Dégradation − Fortifications (qui perd alors 1 point), Traque − Sociétés écrans,
 * Noirceur des objets corrompus entreposés − Salle blanche.
 */
export async function infligerCabale(cabale, cle, points, { objetCorrompu = false, reduire = true } = {}) {
  const s = cabale.system;
  const p = s.perditions?.[cle];
  if (!p) return "";
  const nom = JAUGES_CABALE[cle]?.label ?? cle;
  let effectifs = nombre(points);
  let note = "";
  const maj = {};
  if (effectifs > 0 && reduire) {
    if (cle === "blessures" && s.fortificationsRestant > 0) {
      const r = s.fortificationsRestant;
      effectifs = Math.max(0, effectifs - r);
      maj["system.depenses.fortifications"] = nombre(s.depenses?.fortifications) + 1;
      note = ` (Fortifications ${r}, qui perd 1 point)`;
    } else if (cle === "traque") {
      const n = nombre(s.talents?.statut?.societesEcrans?.niveau);
      if (n > 0) { effectifs = Math.max(0, effectifs - n); note = ` (Sociétés écrans ${n})`; }
    } else if (cle === "noirceur" && objetCorrompu) {
      const n = nombre(s.talents?.technique?.salleBlanche?.niveau);
      if (n > 0) { effectifs = Math.max(0, effectifs - n); note = ` (Salle blanche ${n})`; }
    }
  }
  const avant = nombre(p.value);
  const apres = Math.max(nombre(p.min), Math.min(nombre(p.max) || 10, avant + effectifs));
  if (apres !== avant) maj[`system.perditions.${cle}.value`] = apres;
  if (Object.keys(maj).length) await cabale.update(maj);
  return `${cabale.name} — ${nom} : ${avant} → ${apres}${note}`;
}

/**
 * Traque subie par les Héros : quand la moitié au moins des membres actifs d'une cabale
 * en subissent en même temps, la cabale encaisse autant que le plus touché.
 * @param {Map<Actor, number>} subis  points de Traque réellement subis par héros
 */
export async function traqueCabales(subis) {
  const lignes = [];
  const touches = [...subis.entries()].filter(([a, n]) => a.type === "personnage" && n > 0);
  if (!touches.length) return lignes;
  const cabales = new Map();
  for (const [a] of touches) for (const c of a.cabalesActeurs ?? []) cabales.set(c.id, c);
  for (const cabale of cabales.values()) {
    const membres = membresCabale(cabale, { actifs: true });
    if (!membres.length) continue;
    const parmi = touches.filter(([a]) => membres.some(m => m.id === a.id));
    if (parmi.length * 2 < membres.length) continue;
    const max = Math.max(...parmi.map(([, n]) => n));
    lignes.push(await infligerCabale(cabale, "traque", max));
  }
  return lignes;
}

/** Messages quand une jauge de la cabale franchit 5, 8 ou 10 en montant */
export async function seuilsCabale(cabale, avant) {
  if (cabale.type !== "cabale" || !avant) return;
  const lignes = [];
  for (const [cle, j] of Object.entries(JAUGES_CABALE)) {
    const ancien = nombre(avant[cle]);
    const nouveau = nombre(cabale._source.system.perditions?.[cle]?.value);
    for (const seuil of [5, 8, 10]) {
      if (ancien < seuil && nouveau >= seuil) {
        const p = j.paliers[seuil];
        lignes.push(`<strong>${j.label} ${seuil} — ${p.label}</strong> : ${p.description}`);
      }
    }
  }
  if (!lignes.length) return;
  const destinataires = game.users.filter(u => u.isGM || cabale.testUserPermission(u, "OWNER")).map(u => u.id);
  await ChatMessage.create({
    content: `<div class="nocRoll"><h4>Cabale : ${cabale.name}</h4>${lignes.map(l => `<p>${l}</p>`).join("")}</div>`,
    whisper: destinataires,
    speaker: ChatMessage.getSpeaker({ actor: cabale })
  });
}

/* -------------------------------------------- */
/*  Effets sur les Héros                         */
/* -------------------------------------------- */

/** Minimum de gouttes de Fiel imposé par la Noirceur des cabales (1, 2 ou 3) */
export function plancherFiel() {
  let plancher = 0;
  for (const cabale of game.actors?.filter(a => a.type === "cabale") ?? []) {
    if (!membresCabale(cabale, { actifs: true }).length) continue;
    const etape = palierCabale(cabale.system.perditions?.noirceur?.value);
    plancher = Math.max(plancher, { 0: 0, 5: 1, 8: 2, 10: 3 }[etape]);
  }
  return plancher;
}

/** Palier de Division le plus élevé parmi les cabales d'un personnage */
export function divisionDuPersonnage(actor) {
  let pire = { palier: 0, cabale: null };
  for (const c of actor.cabalesActeurs ?? []) {
    const etape = palierCabale(c.system.perditions?.trauma?.value);
    if (etape > pire.palier) pire = { palier: etape, cabale: c };
  }
  return pire;
}
