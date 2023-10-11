#!/bin/bash
set -e

export NAMESPACE=${1:-teknoir-retail}

npm start
