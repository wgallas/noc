/**
 * Calcul des Blessures infligées aux cibles d'une attaque réussie, pour le MJ
 * (message privé ; le MJ reporte lui-même les Blessures, pas de report automatique).
 *
 * Règles (livre p. 251-252) :
 * - Blessures = dégâts de l'arme + marge (Précision, 1re cible) − Constitution − Armure
 *   (une Constitution négative augmente les dégâts ; minimum 0) ;
 * - Perforant / Tranchant : au moins 2 / 1 Blessure(s) contre une cible sans armure ;
 * - Quantique et Énergie noire : réduits par la Lumière de la cible (minimum 0 ;
 *   les alliés à portée d'aura ne sont pas comptés automatiquement) ;
 * - Multiple (X) : X touches, chacune 1 point de moins que la précédente (ignorée sous 1) ;
 * - Choc et Contrainte : pas de Blessures.
 */

const nombre = v => Number(v) || 0;
const signe = n => (n < 0 ? `−${-n}` : `${n}`);

/** Score d'armure de la cible (la meilleure armure qu'elle porte) */
function armureDe(actor) {
  return actor.items.filter(i => i.type === "armure").reduce((m, i) => Math.max(m, nombre(i.system.armure)), 0);
}

/** Calcule, pour chaque cible, les lignes du message du MJ */
export function calculerBlessures(rollData, cibles) {
  const traits = rollData.arme?.system?.traitsArme ?? {};
  const surnaturel = nombre(rollData.quantique?.succes) + nombre(rollData.energieNoire);
  // Multiple (X), augmenté par l'Étendue choisie sur la marge
  const nbTouches = traits.multiple?.actif ? Math.max(1, nombre(traits.multiple.valeur)) + nombre(rollData.etendue) : 1;
  // sans Multiple, l'attaque ne touche que la première cible
  const touchees = cibles.slice(0, nbTouches);
  return touchees.map((c, i) => {
    const actor = fromUuidSync(c.actorUuid);
    const r = { ...c, cons: null, armure: null, lumiere: null, lignes: [] };
    if (!actor) return r;
    r.cons = nombre(actor.system.talents?.action?.constitution?.niveau);
    r.armure = armureDe(actor);
    r.lumiere = nombre(actor.system.talents?.vie?.lumiere?.niveau);
    if (traits.choc || traits.contrainte?.actif) {
      r.lignes.push(traits.choc ? "Choc : pas de Blessures (comparer la Constitution aux dégâts)" : "Contrainte : pas de Blessures");
      return r;
    }
    const arme = nombre(rollData.degatsArme);
    // Précision : la part de la marge non utilisée en Étendue, sur la 1re touche seulement
    const marge = i === 0 ? Math.max(0, rollData.precision ?? nombre(rollData.margin)) : 0;
    // Perforant / Tranchant : le minimum s'applique avant l'ajout de la marge
    const brut = arme - r.cons - r.armure;
    let base = brut;
    let releve = "";
    if (r.armure === 0 && (traits.perforant || traits.tranchant)) {
      const min = traits.perforant ? 2 : 1;
      const nom = traits.perforant ? "Perforant" : "Tranchant";
      r.lignes.push(`${nom} : cible sans armure, au moins ${min} Blessure${min > 1 ? "s" : ""} avant la marge`);
      if (brut < min) { base = min; releve = `, porté à ${min} (${nom})`; }
    }
    const physique = Math.max(0, base + marge);
    r.lignes.push(`Dégâts ${arme} (arme) − ${signe(r.cons)} (Const.) − ${r.armure} (Armure) = ${signe(brut)}${releve}`
      + (marge ? ` + ${marge} (Précision) = ${physique}` : (!releve && brut < 0 ? ` → ${physique}` : "")));
    let total = physique;
    if (surnaturel > 0) {
      const reduit = Math.max(0, surnaturel - r.lumiere);
      r.lignes.push(`Quantique/Énergie noire ${surnaturel} − ${r.lumiere} (Lumière) = ${reduit}`);
      total += reduit;
    }
    // Multiple sur une seule cible : touches suivantes
    if (nbTouches > 1 && cibles.length === 1) {
      // la Précision ne s'applique qu'à la 1re touche ; les suivantes perdent 1 point chacune
      const sansPrecision = total - marge;
      const touches = [total];
      for (let k = 1; k < nbTouches && sansPrecision - k >= 1; k++) touches.push(sansPrecision - k);
      if (touches.length > 1) r.lignes.push(`Multiple : touches ${touches.join(", ")}`);
    } else if (nbTouches > 1 && i > 0) {
      r.lignes.push(`Multiple : touche n° ${i + 1} (1 point de moins par touche précédente)`);
    }
    return r;
  });
}

/** Message réservé au MJ : attributs des cibles et calcul des Blessures */
export async function messageMJCibles(rollData) {
  const gms = ChatMessage.getWhisperRecipients("GM");
  if (!gms.length) return;
  return ChatMessage.create({
    content: contenuMJCibles(rollData),
    whisper: gms.map(u => u.id),
    speaker: ChatMessage.getSpeaker({ alias: "Loi" })
  });
}

/** Contenu du message de la Loi (recalculé quand l'attaquant répartit sa marge) */
export function contenuMJCibles(rollData) {
  let lignes;
  if (!rollData.blessures?.length) {
    // personne n'a été ciblé : dégâts bruts de l'arme, à réduire par la Loi
    const parts = [`${Number(rollData.degatsArme) || 0} (arme)`];
    const marge = Math.max(0, rollData.precision ?? (Number(rollData.margin) || 0));
    if (marge) parts.push(`${marge} (Précision)`);
    const surnaturel = nombre(rollData.quantique?.succes) + nombre(rollData.energieNoire);
    lignes = `<li><span style="font-weight:bold">Cible inconnue</span><br>Dégâts ${parts.join(" + ")} − Const. − Armure`
      + (surnaturel ? `<br>Quantique/Énergie noire ${surnaturel} − Lumière` : "") + `</li>`;
  } else {
    lignes = rollData.blessures.map(b =>
      `<li><span style="font-weight:bold">${b.nom}</span> : Constitution ${b.cons ?? "—"}, Armure ${b.armure ?? "—"}, Lumière ${b.lumiere ?? "—"}`
      + b.lignes.map(l => `<br>${l}`).join("") + `</li>`).join("");
  }
  const attaquant = rollData.alias || game.actors.get(rollData.actorId)?.name || "";
  const marge = rollData.choixMarge ? `<p class="note-combat">Marge : Précision ${rollData.precision}, Étendue ${rollData.etendue} (Multiple ${rollData.multipleTotal})</p>` : "";
  return `<div class="nocRoll"><h4>${attaquant} — ${rollData.arme?.name ?? ""}</h4>${marge}<ul class="cibles-mj">${lignes}</ul></div>`;
}

/** Cibles actuelles de l'utilisateur (jetons ciblés) */
export function ciblesActuelles() {
  return Array.from(game.user.targets ?? [])
    .filter(t => t.actor)
    .map(t => ({ nom: t.name ?? t.actor.name, actorUuid: t.actor.uuid }));
}
