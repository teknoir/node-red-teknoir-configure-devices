#!/bin/bash
set -e

# export NAMESPACE=${1:-teknoir-retail}
export NAMESPACE=${1:-demonstrations}
npm install
npm start
