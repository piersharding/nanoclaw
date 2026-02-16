#!/bin/sh
#

set -x
set -e

npm run build
systemctl --user restart nanoclaw

