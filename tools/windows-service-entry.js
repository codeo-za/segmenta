const
    which = require("which"),
    path = require("path"),
    childProcess = require("child_process");

(async function () {
    const
        npm = await which("npm"),
        npmProcess = childProcess.spawn(
            "cmd.exe",
            ["/c", npm, "start"],
            {cwd: path.dirname(__dirname)}
        );
    npmProcess.stdout.on("data", d => console.log(d.toString()));
    npmProcess.stderr.on("error", d => console.error(d.toString()));

    npmProcess.on("exit", function (code) {
        console.log({
            npm,
            code
        });
        process.exit(code || 0);
    });
})();
