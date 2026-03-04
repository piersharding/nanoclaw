#!/bin/sh
#

set -x
set -e

git restore -s upstream/main -- package-lock.json
npm install --save link-preview-js
npm audit fix

npm run build
systemctl --user restart nanoclaw

