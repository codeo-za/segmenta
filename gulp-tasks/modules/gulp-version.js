var
    gulpInfo = require("gulp/package.json"),
    parts = gulpInfo.version.split(".").map(s => parseInt(s, 10));
module.exports = {
    major: parts[0],
    minor: parts[1],
    patch: parts[2]
};
