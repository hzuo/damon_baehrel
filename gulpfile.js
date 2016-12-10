'use strict';

const gulp = require('gulp');
const jscs = require('gulp-jscs');
const jshint = require('gulp-jshint');

gulp.task('jshint', () => {
  return gulp.src(['**/*.js', '!node_modules/**'])
    .pipe(jshint())
    .pipe(jshint.reporter('jshint-stylish'));
});

gulp.task('jscs', () => {
  return gulp.src(['**/*.js', '!node_modules/**'])
    .pipe(jscs())
    .pipe(jscs.reporter());
});

gulp.task('lint', ['jshint', 'jscs']);
