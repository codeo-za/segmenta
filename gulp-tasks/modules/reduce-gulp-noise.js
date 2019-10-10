// gulp4 introduces a lot of unnecessary noise
// in logging, particularly with "<anonymous>" tasks
// which seem to be created as part of the task dep graph
// but also because the gulp-with-help shim will generate
// wrappers with `gulp.series` and `gulp.parallel` to
// provide gulp3 backward-compatibility for task definition
// -> the aim is to suppress that noise
const
    marker = "::: [suppress] :::",
    gulp = require("gulp"),
    log = require("gulplog"),
    originalInfo = log.info;

log.info = function(...args) {
    var taskName = args[1] || "";
    if (
        taskName.indexOf(marker) > -1 ||
        taskName.indexOf("<anonymous>") > -1
    ) {
        return;
    }
    originalInfo.apply(gulp, args);
};

function markForSuppression(str) {
    return process.argv.indexOf("--tasks") > 0
        ? str
        : `${marker}(${str})`
}

module.exports = {
    marker,
    markForSuppression
};
