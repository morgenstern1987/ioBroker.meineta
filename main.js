"use strict";

const utils = require("@iobroker/adapter-core");
const EtaClient = require("./lib/etaClient");
const { extractVariables } = require("./lib/menuParser");

class MeinEta extends utils.Adapter {

    constructor(options) {
        super({
            ...options,
            name: "meineta"
        });

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
    }

    async onReady() {

        if (!this.config.host) {
            this.log.error("Bitte ETA IP konfigurieren");
            return;
        }

        this.client = new EtaClient(this.config.host, this.config.port);

        await this.createVarSet();
        await this.discoverVariables();

        this.subscribeStates("values.*");

        this.pollTimer = setInterval(() => {
            this.pollVars();
            this.pollErrors();
        }, this.config.pollInterval);

    }

    async createVarSet() {

        try {
            await this.client.put(`/user/vars/${this.config.varset}`);
        } catch {
            this.log.debug("VarSet existiert bereits");
        }

    }

    async discoverVariables() {

        this.log.info("Lese ETA Menüstruktur...");

        const data = await this.client.get("/user/menu");

        const menu = data.eta.menu[0];

        const variables = extractVariables(menu);

        for (const v of variables) {

            const id = v.uri.replace(/\//g, "_");

            await this.setObjectNotExistsAsync(`values.${id}`, {
                type: "state",
                common: {
                    name: v.name,
                    type: "number",
                    role: "value",
                    read: true,
                    write: true
                },
                native: {
                    uri: v.uri
                }
            });

            const uri = v.uri.replace("/","");

            try {
                await this.client.put(`/user/vars/${this.config.varset}/${uri}`);
            } catch {}

        }

        this.log.info(`Gefundene Variablen: ${variables.length}`);

    }

    async pollVars() {

        try {

            const data = await this.client.get(`/user/vars/${this.config.varset}`);

            const vars = data.eta.vars?.[0]?.variable;

            if (!vars) return;

            for (const v of vars) {

                const uri = v.$.uri;
                const id = `values.${uri.replace(/\//g,"_")}`;

                const raw = parseFloat(v._);
                const scale = parseFloat(v.$.scaleFactor || 1);

                await this.setStateAsync(id, raw / scale, true);

            }

        } catch (e) {
            this.log.error(e);
        }

    }

    async pollErrors() {

        try {

            const data = await this.client.get("/user/errors");

            await this.setObjectNotExistsAsync("errors.raw", {
                type: "state",
                common: {
                    type: "string",
                    role: "json",
                    read: true,
                    write: false
                },
                native: {}
            });

            await this.setStateAsync("errors.raw", JSON.stringify(data), true);

        } catch (e) {
            this.log.error(e);
        }

    }

    async onStateChange(id, state) {

        if (!state || state.ack) return;

        const obj = await this.getObjectAsync(id);

        if (!obj?.native?.uri) return;

        const raw = Math.round(state.val);

        await this.client.post(`/user/var${obj.native.uri}`, `value=${raw}`);

    }

}

if (require.main !== module) {
    module.exports = (options) => new MeinEta(options);
} else {
    new MeinEta();
}
