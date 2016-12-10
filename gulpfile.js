'use strict';

var gulp = require('gulp');
var jscs = require('gulp-jscs');
var jshint = require('gulp-jshint');

gulp.task('jshint', function () {
  return gulp.src(['**/*.js', '!node_modules/**'])
    .pipe(jshint())
    .pipe(jshint.reporter('jshint-stylish'));
});

gulp.task('jscs', function () {
  return gulp.src(['**/*.js', '!node_modules/**'])
    .pipe(jscs());
});

gulp.task('lint', ['jshint', 'jscs']);
