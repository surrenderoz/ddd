#!/usr/bin/env sh

npm init --yes
npm install --save-dev gulp gulp-clean gulp-size gulp-concat gulp-clean-css gulp-terser
mkdir -p dist/
gulp
