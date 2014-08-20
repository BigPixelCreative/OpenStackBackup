var gulp = require('gulp');

var coffee = require('gulp-coffee');

var paths = {
    scripts: "src/*.coffee"
};

gulp.task('scripts', function() {
    // Minify and copy all JavaScript (except vendor scripts)
    return gulp.src(paths.scripts)
        .pipe(coffee({bare: true}))
        .pipe(gulp.dest('build'));
});

gulp.task('watch', function() {
    gulp.watch(paths.scripts, ['scripts']);
});

gulp.task('default', ['scripts', 'watch']);
