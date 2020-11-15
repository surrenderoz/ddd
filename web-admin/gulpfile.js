const
    gulp = require('gulp'),
    concat = require('gulp-concat'),
    size = require('gulp-size'),
    clean = require('gulp-clean'),
    cleanCSS = require('gulp-clean-css'),
    terser = require('gulp-terser')
;

gulp.task('clean', function(){
    return gulp.src('dist/', {read: false})
        .pipe(clean())
});

gulp.task('styles', function(){
    return gulp.src(['css/*.css'])
        .pipe(concat('app.min.css'))
        .pipe(cleanCSS({
            keepBreaks: true
        }))
        .pipe(size({
            title: 'Size of CSS'
        }))
        .pipe(gulp.dest('dist/css'));
});

gulp.task('deps-styles', function(){
    return gulp.src(['css/lib/*.css'])
        .pipe(concat('deps.min.css'))
        .pipe(cleanCSS({
            keepBreaks: true
        }))
        .pipe(size({
            title: 'Size of deps CSS'
        }))
        .pipe(gulp.dest('dist/css'));
});

gulp.task('scripts', function(){
    return gulp.src(['js/*.js'])
        .pipe(concat('app.min.js'))
        .pipe(terser())
        .pipe(size({
            title: 'Size of JS'
        }))
        .pipe(gulp.dest('dist/js'));
});

gulp.task('deps-scripts', function() {
    return gulp.src(['js/lib/*.js'])
        .pipe(concat('deps.min.js'))
        .pipe(size({
            title: 'Size of JS libs'
        }))
        .pipe(gulp.dest('dist/js'));
});

gulp.task('default', gulp.series('clean', gulp.parallel('styles', 'deps-styles', 'scripts', 'deps-scripts')));
