const
  gulp = requireModule("gulp-with-help"),
  ts = require("gulp-typescript");

const tsProject = ts.createProject("tsconfig.json");

gulp.task("build", () =>{
  return gulp.src("src/**/*.ts")
    .pipe(tsProject())
    .pipe(gulp.dest("dist"));
});
