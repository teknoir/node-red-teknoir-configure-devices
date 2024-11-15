#!/bin/bash
set -e

export NAMESPACE=${1:-demonstrations}
npm install
pushd debug
npm install
npm run nodemon
popd
