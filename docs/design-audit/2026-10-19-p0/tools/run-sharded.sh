#!/bin/sh
# usage: run-sharded.sh <repoRoot> <outDir> <label>   (runs pages in parallel)
ROOT=$1; OUT=$2; LABEL=$3; HERE=$(dirname "$0")
for P in index.html solution.html trainer.html price.html access.html legal.html privacy.html terms.html blog/index.html blog/personal-training-frequency/; do
  N=$(echo "$P" | tr '/.' '__')
  PAGES=$P node "$HERE/p0-measure.mjs" "$ROOT" "$OUT" "$LABEL-$N" > "$OUT/log-$LABEL-$N.txt" 2>&1 &
done
wait
