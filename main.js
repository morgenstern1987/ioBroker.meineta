"use strict";

const utils = require("@iobroker/adapter-core");
const EtaClient = require("./lib/etaClient");
const { extractVariables } = require("./lib/menuParser");
const { buildObjectPath } = require("./lib/nameMapper");

class MeinEta extends utils.Adapter {

    constructor(options) {

        super({
            ...options,
            name: "meineta"
        });

        this.uriMap = {};
        this.objectsReady = false;
        this.pollTimer = null;

        this.on("ready", this.onReady.bind(this));
        this.on("unload", this.onUnload.bind(this));

    }

    async onReady() {

        try {

            if (!this.config.host) {
                this.log.error("Keine ETA IP konfiguriert");
                return;
            }

            this.client = new EtaClient(this.config.host, this.config.port);

            await this.ensureVarSet();

            await this.discoverVariables();

            this.objectsReady = true;

            this.log.info("Discovery abgeschlossen");

            this.pollTimer = setInterval(() => {
                this.pollVars();
            }, this.config.pollInterval);

            await this.pollVars();

        } catch (error) {

            this.log.error(`Startfehler: ${error}`);

        }

    }

    async onUnload(callback) {

        try {

            if (this.pollTimer) clearInterval(this.pollTimer);

            callback();

        } catch {
            callback();
        }

    }

    async ensureVarSet() {

        try {

            await this.client.put(`/user/vars/${this.config.varset}`);

        } catch {

            this.log.debug("VarSet existiert bereits");

        }

    }

    async discoverVariables() {

        this.log.info("Lese ETA Menüstruktur");

        const data = await this.client.get("/user/menu");

        const menu = data.eta.menu[0];

        const variables = extractVariables(menu);

        this.log.info(`Gefundene Variablen: ${variables.length}`);

        for (const v of variables) {

            if (!v.uri) continue;

            const id = buildObjectPath(v.path);

            this.uriMap[v.uri] = id;

            await this.createState(id, v.name, v.uri);

            const uri = v.uri.replace(/^\//, "");

            try {

                await this.client.put(`/user/vars/${this.config.varset}/${uri}`);

            } catch {}

        }

    }

    async createState(id, name, uri) {

        const obj = await this.getObjectAsync(id);

        if (obj) return;

        await this.setObjectAsync(id, {
            type: "state",
            common: {
                name: name || id,
                type: "number",
                role: "value",
                read: true,
                write: false
            },
            native: {
                uri
            }
        });

    }

    async pollVars() {

        if (!this.objectsReady) return;

        try {

            const data = await this.client.get(`/user/vars/${this.config.varset}`);

            const vars = data?.eta?.vars?.[0]?.variable;

            if (!vars) return;

            for (const v of vars) {

                const uri = v.$.uri;

                const id = this.uriMap[`/${uri}`] || this.uriMap[uri];

                if (!id) continue;

                const obj = await this.getObjectAsync(id);

                if (!obj) continue;

                const raw = parseFloat(v._);
                const scale = parseFloat(v.$.scaleFactor || 1);

                const value = raw / scale;

                const unit = v.$.unit || "";

                if (unit && obj.common.unit !== unit) {

                    obj.common.unit = unit;

                    await this.setObjectAsync(id, obj);

                }

                await this.setStateAsync(id, value, true);

            }

        } catch (error) {

            this.log.error(`Polling Fehler: ${error}`);

        }

    }

}

if (require.main !== module) {
    module.exports = (options) => new MeinEta(options);
} else {
    new MeinEta();
}
