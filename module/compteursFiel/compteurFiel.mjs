import { plancherFiel } from "../cabale.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Compteur de Fiel (ApplicationV2, sans cadre de fenêtre), placé sous les
 * contrôles de scène. this.object = réglage noc.compteurFiel (gouttes, menace,
 * effetActif).
 */
export default class CompteurFiel extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        id: "CompteurFiel",
        classes: ["noc-compteur"],
        window: { frame: false, positioned: false },
        actions: {
            gouttePlus: function () { return this.gouttePlus(1); },
            goutteMoins: function () { return this.goutteMoins(1); },
            addEffect: function () { return this.openEffectCreator(); },
            deleteEffect: function (event, cible) { return this.deleteEffect(cible); }
        }
    };

    static PARTS = {
        main: { template: "systems/noc/templates/window_app/compteurFiel.hbs" }
    };

    /** @override */
    async _prepareContext(options) {
        this.object = foundry.utils.deepClone(game.settings.get("noc", "compteurFiel") ?? {});
        this.object.effetActif ??= {};
        return {
            object: this.object,
            isGM: game.user.isGM,
            effets: CONFIG.NOC.effetsFiel
        };
    }

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);
        const aiguille = this.element.querySelector('#aiguille');
        if (aiguille) aiguille.style.transform = `rotate(${(Number(this.object.gouttes) || 0) * (-10.285)}deg)`;
    }

    /** Le compteur se place sous les contrôles de scène (sinon dans l'interface) */
    _insertElement(element) {
        const existant = document.getElementById(element.id);
        if (existant) { existant.replaceWith(element); return; }
        const controles = document.getElementById("scene-controls");
        if (controles) controles.after(element);
        else (document.getElementById("interface") ?? document.body).append(element);
        element.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    }

    async deleteEffect(cible) {
        const effectId = cible.closest('.effect')?.dataset.effectId;
        if (!effectId || !game.user.isGM) return;
        delete this.object.effetActif[effectId];
        await this.updateFiel(this.object);
    }

    async updateFiel(fiel) {
        await game.settings.set('noc', 'compteurFiel', fiel);
        this.render(true);
        game.socketManager.launchSocket("renderCompteur", {});
        Hooks.callAll("updatedFiel", this, fiel);
    }

    /** Valeur actuelle (lue dans le réglage si le compteur n'a pas encore été affiché) */
    _etat() {
        this.object ??= foundry.utils.deepClone(game.settings.get("noc", "compteurFiel") ?? {});
        this.object.gouttes = Number(this.object.gouttes) || 0;
        return this.object;
    }

    caclculMenace() {
        const oldValue = this.object.menace;
        // Noirceur des cabales : le Fiel ne descend pas sous 1, 2 ou 3 gouttes
        this.object.gouttes = Math.max(plancherFiel(), Math.min(35, this.object.gouttes));
        this.object.menace = Math.trunc(this.object.gouttes / 5);
        // nouvelle Menace : le MJ choisit l'effet de Fiel dans son panneau
        if (oldValue < this.object.menace && game.user.isGM) {
            ui.notifications.info(`Menace ${this.object.menace} : choisissez un effet de Fiel dans le panneau du MJ.`);
            game.noc?.panneauMJ?.();
        }
    }

    async goutteMoins(qt) {
        Hooks.callAll("preMinusFiel", this, qt);
        this._etat().gouttes -= qt;
        this.caclculMenace();
        return this.updateFiel(this.object);
    }

    async gouttePlus(qt) {
        Hooks.callAll("preAddFiel", this, qt);
        this._etat().gouttes += qt;
        this.caclculMenace();
        return this.updateFiel(this.object);
    }

    /** Les effets de Fiel se gèrent depuis le panneau du MJ */
    openEffectCreator() {
        game.noc?.panneauMJ?.();
    }
}
