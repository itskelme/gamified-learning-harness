#!/usr/bin/env bash
# Builds the five gate lessons through the generic entry, one at a time, and prints one rc line per lesson.
# Usage: bash scripts/build-all-lessons.sh [extra build-lesson flags]
set -u
cd "$(dirname "$0")/.."
rc_all=0
run() {
  local label=$1; shift
  node scripts/build-lesson.mjs "$@"
  local rc=$?
  echo "RC $label $rc"
  [ "$rc" -eq 0 ] || rc_all=1
}
run prova3 lessons/prova3-statistics.lesson.json "${@}"
run humanities lessons/humanities-decisions.lesson.json "${@}"
run teste-z lessons/teste-z-uma-media.lesson.json "${@}"
run stem-v01 examples/stem.lesson.json "${@}"
run brief --brief examples/briefs/vies-de-sobrevivencia.brief.json "${@}"
exit $rc_all
