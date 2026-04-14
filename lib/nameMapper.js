function normalizeName(name) {

    return name
        .toLowerCase()
        .replace(/[^\w]+/g, "_")
        .replace(/^_+|_+$/g, "");

}

function buildObjectPath(pathArray) {

    const names = pathArray.map(normalizeName);

    if (names.includes("kessel") || names.includes("boiler"))
        return ["boiler", names.at(-1)].join(".");

    if (names.includes("puffer") || names.includes("buffer"))
        return ["buffer", names.at(-1)].join(".");

    if (names.includes("heizkreis") || names.includes("hk1"))
        return ["heating.hk1", names.at(-1)].join(".");

    if (names.includes("hk2"))
        return ["heating.hk2", names.at(-1)].join(".");

    if (names.includes("außentemperatur"))
        return ["outside", "temperature"].join(".");

    if (names.includes("pellet"))
        return ["pellet", names.at(-1)].join(".");

    return names.join(".");

}

module.exports = {
    normalizeName,
    buildObjectPath
};
