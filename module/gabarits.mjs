/**
 * Gabarits de corrompus (livre de base p. 275).
 *
 * Un gabarit est un objet glissé sur la fiche d'un personnage, d'un rouage,
 * d'un Autre ou d'une créature. Ses bonus de Domaines et de Talents sont
 * calculés à la préparation de l'acteur, par-dessus l'archétype et
 * l'Énergie noire des Autres : supprimer l'objet rend la fiche d'origine.
 *
 * - system.domaines : { domaine: bonus }
 * - system.talents  : [{ talent: "domaine.talent", value }]
 * - system.multiple : les attaques gagnent Multiple (2), ou X + 1 si l'arme a déjà Multiple (X)
 * - system.special  : rappel de règle (texte), par exemple le Choc du sadique,
 *                     que la Loi ajoute elle-même aux armes concernées.
 */
import { libelleTalent, talentsDuSysteme, domainesDuSysteme } from "./archetypes.mjs";
import { texteTraits } from "./armes.mjs";

/** Types d'acteurs qui acceptent un gabarit */
export const TYPES_GABARIT = ["personnage", "rouage", "autre", "creature"];

/** Le gabarit porté par l'acteur (un seul) */
export function gabaritDe(actor) {
  return actor?.items?.find(i => i.type === "gabarit") ?? null;
}

/** Bonus de Talents d'un gabarit, sans doublon ni talent inconnu */
export function talentsGabarit(systemGabarit) {
  const talents = talentsDuSysteme();
  const parCle = new Map();
  for (const t of Array.isArray(systemGabarit?.talents) ? systemGabarit.talents : []) {
    const [dom, tal] = String(t?.talent ?? "").split(".");
    const v = Number(t?.value) || 0;
    if (!v || !talents[dom]?.[tal]) continue;
    parCle.set(`${dom}.${tal}`, (parCle.get(`${dom}.${tal}`) ?? 0) + v);
  }
  return [...parCle].map(([talent, value]) => ({ talent, value }));
}

const signe = v => (v > 0 ? `+${v}` : `${v}`);
const majuscule = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);

/** Résumé lisible : « Social +1, Âme +1 ; Déplacement +1… ; attaques : Multiple » */
export function resumeGabarit(systemGabarit) {
  const doms = domainesDuSysteme();
  const parties = [];
  const d = Object.entries(systemGabarit?.domaines ?? {})
    .filter(([, v]) => Number(v))
    .map(([k, v]) => `${majuscule(doms[k]?.label ?? k)} ${signe(Number(v))}`);
  if (d.length) parties.push(`Domaines : ${d.join(", ")}`);
  const t = talentsGabarit(systemGabarit).map(x => `${majuscule(libelleTalent(x.talent))} ${signe(x.value)}`);
  if (t.length) parties.push(`Talents : ${t.join(", ")}`);
  if (systemGabarit?.multiple) parties.push("Attaques : Multiple (2), ou +1 si l'arme a déjà Multiple");
  if (systemGabarit?.special) parties.push(String(systemGabarit.special));
  return parties.join(" — ");
}

/** Applique les bonus du gabarit (appelé à la préparation de l'acteur) */
export function appliquerGabarit(actor) {
  if (!TYPES_GABARIT.includes(actor.type)) return;
  const gabarit = gabaritDe(actor);
  if (!gabarit) return;
  const s = actor.system;
  actor.overrides ??= {};
  for (const [dom, v] of Object.entries(gabarit.system.domaines ?? {})) {
    const n = Number(v) || 0;
    const d = s.domaines?.[dom];
    if (!n || !d) continue;
    d.value = (Number(d.value) || 0) + n;
    foundry.utils.setProperty(actor.overrides, `system.domaines.${dom}.value`, d.value);
  }
  for (const { talent, value } of talentsGabarit(gabarit.system)) {
    const [dom, tal] = talent.split(".");
    const t = s.talents?.[dom]?.[tal];
    if (!t) continue;
    t.niveau = (Number(t.niveau) || 0) + value;
    foundry.utils.setProperty(actor.overrides, `system.talents.${dom}.${tal}.niveau`, t.niveau);
  }
}

/**
 * Attaque d'un acteur portant un gabarit « Multiple » : la copie de l'arme utilisée
 * pour le jet reçoit Multiple (2), ou X + 1. L'arme elle-même n'est pas modifiée.
 */
export function armeAvecGabarit(actor, arme) {
  const gabarit = gabaritDe(actor);
  if (!gabarit?.system.multiple || !arme?.system) return arme;
  const traits = foundry.utils.deepClone(arme.system.traitsArme ?? {});
  const m = traits.multiple;
  const x = m?.actif ? (Number(m.valeur) || 0) + 1 : 2;
  traits.multiple = { actif: true, valeur: x };
  arme.system.traitsArme = traits;
  const base = arme.lameCachee ? "Lame cachée, " : (arme.type === "outil" ? "Arme improvisée, " : "");
  arme.system.traits = `${base}${texteTraits(traits)} — gabarit ${gabarit.name}`;
  return arme;
}
