#!/bin/bash
set -e

export NAMESPACE=${1:-teknoir-demo}
npm install
npm start
