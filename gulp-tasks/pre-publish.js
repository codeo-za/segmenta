const
  gulp = requireModule("gulp-with-help");


gulp.task("pre-publish",
  "Collects all publishable artifacts to the .publish dir",
  [ "build" ], () => {
  return gulp.src("dist/src/**/*")
    .pipe(gulp.dest(".publish"));
});
