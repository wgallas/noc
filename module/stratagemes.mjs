/**
 * Stratagèmes (livre de base p. 257) : petites améliorations d'un équipement.
 * Chaque stratagème ne peut être attribué qu'une fois à un objet donné.
 *
 * Données (armes, outils, armures, objets usuels) :
 * - system.stratagemes : { cle: true/false }
 * - system.stratagemeTalent : talent amélioré par Ergonomie ("domaine.talent"),
 *   pour un objet qui n'est pas une arme (une arme améliore Combat)
 * - system.stratagemePerformant : la performance accrue de 50 %
 *
 * Effets calculés :
 * - Ergonomie : arme → +1 en Combat au jet ; autre objet → case « +1 » proposée
 *   dans la fenêtre de jet du talent lié.
 * - Mortel : arme (ou outil utilisable comme arme) → dégâts +1 ; outil qui n'est
 *   pas une arme → il devient une arme de contact (Constitution + 2).
 * - Sensibilité : case « +2 pour détecter la Noirceur » proposée dans la fenêtre
 *   de jet de Sensibilité.
 * Les autres stratagèmes sont des rappels (infobulles, fiche de l'objet).
 */
import { libelleTalent, talentsDuSysteme } from "./archetypes.mjs";

const majuscule = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);

export const TYPES_STRATAGEMES = ["arme", "outil", "armure", "objetusuel"];

export const STRATAGEMES = {
  compartiment: {
    label: "Compartiment secret",
    regle: "L'objet contient une cache (poche, double fond…) d'environ un dixième de son volume. La localiser demande 4 niveaux de Recherche."
  },
  ergonomie: {
    label: "Ergonomie",
    regle: "Quand il est utilisé, l'objet donne +1 au Talent auquel il correspond (Combat pour une arme)."
  },
  mortel: {
    label: "Mortel",
    regle: "Arme : dégâts +1. Objet qui n'est pas fait pour attaquer : il cache une lame ou un poinçon et devient une arme de contact (Constitution + 2)."
  },
  lumineux: {
    label: "Lumineux",
    regle: "L'objet contient une petite source de lumière (résine, ou quantar s'il est assez grand) : 15 minutes d'éclairage dans un rayon de 5 m."
  },
  empoisonne: {
    label: "Empoisonné",
    regle: "L'objet contient une petite dose de toxine violente (p. 252) et un système d'injection ou de libération."
  },
  performant: {
    label: "Performant",
    regle: "Appareil : l'une de ses performances est accrue de 50 % (portée, vitesse…), à préciser avec la Loi."
  },
  sensibilite: {
    label: "Sensibilité",
    regle: "L'objet réagit à la présence d'une source de Noirceur : porté, il donne +2 en Sensibilité pour détecter la Noirceur (p. 255)."
  }
};

/** Clés des stratagèmes actifs d'un objet */
export function stratagemesActifs(item) {
  const s = item?.system?.stratagemes ?? {};
  return Object.keys(STRATAGEMES).filter(cle => s[cle]);
}

/** Texte d'infobulle : « Ergonomie (Combat) : … ; Mortel : … » */
export function texteStratagemes(item) {
  const sys = item?.system ?? {};
  return stratagemesActifs(item).map(cle => {
    let nom = STRATAGEMES[cle].label;
    if (cle === "ergonomie") nom += ` (${item.type === "arme" ? "Combat" : (sys.stratagemeTalent ? majuscule(libelleTalent(sys.stratagemeTalent)) : "talent à préciser")})`;
    if (cle === "performant" && sys.stratagemePerformant) nom += ` (${sys.stratagemePerformant})`;
    return `${nom} : ${STRATAGEMES[cle].regle}`;
  }).join("\n");
}

/** Données de la partie « Stratagèmes » d'une fiche d'objet */
export function contexteStratagemes(item) {
  const s = item.system?.stratagemes ?? {};
  return {
    liste: Object.entries(STRATAGEMES).map(([cle, d]) => ({ cle, label: d.label, regle: d.regle, actif: !!s[cle] })),
    estArme: item.type === "arme",
    ergonomie: !!s.ergonomie,
    performant: !!s.performant,
    talent: item.system?.stratagemeTalent ?? "",
    performance: item.system?.stratagemePerformant ?? "",
    listeTalents: Object.entries(talentsDuSysteme()).map(([dom, talents]) => ({
      domaine: dom,
      talents: Object.entries(talents).map(([tal, t]) => ({ cle: `${dom}.${tal}`, label: t.label }))
    }))
  };
}

/** Un outil devient-il une arme (improvisée, ou par le stratagème Mortel) ? */
export function outilUtilisableCommeArme(item) {
  return item?.type === "outil" && !!(item.system.improvisee?.active || item.system.stratagemes?.mortel);
}

/**
 * Copie d'arme utilisée pour un jet : effets des stratagèmes de l'objet.
 * @returns {{arme: object, bonusCombat: number, lignes: string[]}}
 */
export function armeAvecStratagemes(item, arme) {
  const s = item?.system?.stratagemes ?? {};
  const lignes = [];
  let bonusCombat = 0;
  if (s.ergonomie) {
    bonusCombat += 1;
    lignes.push("Ergonomie (stratagème) : +1 en Combat");
  }
  if (s.mortel && arme?.system) {
    const formule = String(arme.system.degats ?? "0");
    arme.system.degats = `${formule} + 1`;
    lignes.push("Mortel (stratagème) : dégâts +1");
  }
  return { arme, bonusCombat, lignes };
}

/**
 * Bonus d'équipement proposés dans la fenêtre de jet d'un talent :
 * Ergonomie de l'objet lié à ce talent, Sensibilité pour détecter la Noirceur.
 */
export function bonusEquipementTalent(actor, domaineId, talentId) {
  const cleTalent = `${domaineId}.${talentId}`;
  const liste = [];
  for (const item of actor.items) {
    if (!TYPES_STRATAGEMES.includes(item.type) || item.type === "arme") continue;
    const s = item.system.stratagemes ?? {};
    if (s.ergonomie && item.system.stratagemeTalent === cleTalent) {
      liste.push({ id: `${item.id}-ergonomie`, label: `${item.name} (Ergonomie)`, bonus: 1, actif: false });
    }
  }
  if (cleTalent === "ame.sensibilite") {
    for (const item of actor.items) {
      if (TYPES_STRATAGEMES.includes(item.type) && item.system.stratagemes?.sensibilite) {
        liste.push({ id: `${item.id}-sensibilite`, label: `${item.name} (Sensibilité) : détecter la Noirceur`, bonus: 2, actif: false });
      }
    }
  }
  return liste;
}

/** Total des bonus d'équipement retenus pour le jet */
export function totalBonusEquipement(rollData) {
  const choisis = (rollData.equipements ?? []).filter(e => e.actif).reduce((t, e) => t + (Number(e.bonus) || 0), 0);
  return choisis + (Number(rollData.bonusStratagemeArme) || 0);
}
