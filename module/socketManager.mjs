import { appliquerSoin } from "./soins.mjs";
import { objetDieu } from "./objectDieu.mjs";
import { retirerGouttesHostiles } from "./fiel/gouttes.mjs";


export class SocketManager {
    constructor() {
        this.userId = "";
        this.scope = "system.noc"

    };
    init() {
        this.userId = game.userId;
        this.initReceiver
    }

    createMessage(type, data, isGM = false) {
        return {
            isGMAction: isGM,
            userId: game.user._id,
            type: type,
            data: data,
            actionLabel: ""
        }
    }
    async launchSocket(type, data) {
        let msg = this.createMessage(type, data, game.user.isGM);
        game.socket.emit(this.scope, msg);


    }
    async manageReceived(socketMsg) {
        switch (socketMsg.type) {
            case "gouttePlus":
                if (!game.user.isGM) return;
                this.launchSocket("dispayDroplet", {})
                ui.compteur.gouttePlus(socketMsg.data.qt)
                break;
            case "goutteHostile":
                await retirerGouttesHostiles(socketMsg.data.qt, socketMsg.data.nom);
                break;
            case "appliquerSoin": {
                if (!game.users.activeGM?.isSelf) return;
                const actor = await fromUuid(socketMsg.data.actorUuid);
                if (actor) await appliquerSoin(actor, socketMsg.data.talent, socketMsg.data.niveau, socketMsg.data.soignant);
                break;
            }
            case "renderCompteur":
                ui.compteur.render(true);
                break;
            case "displayMecanisme":
                objetDieu.produceMecanisme();
                break
            case "displayFiel":
                objetDieu.displayFiel();
                break
            case "displayFaisceau":
                objetDieu.displayFaisceau();
                break
            case "displayDroplet":
                objetDieu.displayDroplet();
                break
            default: return;
        }
    }

}

