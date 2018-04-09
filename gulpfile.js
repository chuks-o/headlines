var gulp = require('gulp');
var sass = require('gulp-sass');
var source = require('vinyl-source-stream')
var browserSync = require('browser-sync');
var browserify = require('browserify')
var watchify = require('watchify')
var uglify = require('gulp-uglify');
var del = require('del');
var runsequence = require('run-sequence');


/* Development Tasks 
----------------- */


// Start browserSync server
gulp.task('browserSync', function () {
    browserSync({
        server: {
            baseDir: 'public'
        }
    })
})

gulp.task('sass', function () {
    return gulp.src('public/stylesheets/scss/**/*.scss') // Gets all files ending with .scss in public/scss and children dirs
        .pipe(sass().on('error', sass.logError)) // Passes it through a gulp-sass, log errors to console
        .pipe(gulp.dest('public/dist/css')) // Outputs it in the css folder
        .pipe(browserSync.reload({ // Reloading with Browser Sync
            stream: true
        }));
})

/* browserify */
gulp.task('browserify', function () {
    var bundler = browserify({
        entries: 'public/js/main.js',
        cache: {}, packageCache: {}, fullPaths: true, debug: true
    });

    var bundle = function () {
        return bundler
            .bundle()
            .on('error', function () { })
            .pipe(source('bundle.js'))
            .pipe(gulp.dest('public/dist/js'));
    };

    if (global.isWatching) {
        bundler = watchify(bundler);
        bundler.on('update', bundle);
    }

    return bundle();
});

// Watchers
gulp.task('watch', function () {
    gulp.watch('public/stylesheets/scss/**/*.scss', ['sass']);
    gulp.watch('public/*.html', browserSync.reload);
    gulp.watch('public/js/**/*.js', ['browserify']);
})


// Build Sequences
// ---------------

gulp.task('default', function (callback) {
    runsequence(['sass', 'browserify','browserSync'], 'watch',
        callback
    )
})

// gulp.task('build', function (callback) {
//     runSequence(
//         'clean:dist',
//         'sass',
//         callback
//     )
// })