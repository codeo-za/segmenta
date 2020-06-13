const
    path = require("path"),
    srcFolder = path.join(path.dirname(__dirname), "src"),
    entry = path.join(srcFolder, "in
    Service = require("node-windows").Service,
    yargs = require("yargs");

function generateService() {
    return new Service({
        name: "segmenta",
        description: "Segmenta Express server",
        script:
    });
}

yargs.command("install", "install the windows service", args => {
}).command("uninstall", "uninstall the windows service", args => {
});

