#!/bin/bash
set -e

export NAMESPACE=${1:-teknoir-demos}

npm start
