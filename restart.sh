#!/bin/sh
#

set -x
set -e

npm install --save link-preview-js

npm run build
systemctl --user restart nanoclaw

