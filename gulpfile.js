var gulp = require('gulp')
var del = require('del')
var source = require('vinyl-source-stream')
var path = require('path')
var runsequence = require('gulp-run-sequence')
var webserver = require('gulp-webserver')
var browserify = require('browserify')
var watchify =  require('watchify')
var sass = require('gulp-sass')
var sourcemaps = require('gulp-sourcemaps')

gulp.task('clean', function (done) {
    del(['build'], done);
});

gulp.task('stylesheet', function () {
    return gulp.src('public/stylesheets/scss/*.scss')
        .pipe(less())
        .pipe(minifyCSS())
        .pipe(gulp.dest('build/css'))
})

gulp.watch()

gulp.task('js', function() {
    return browserify('./main.js')
    .bundle()
})

gulp.task('default', ['clean', 'stylesheet', 'js'])
