#!/usr/bin/env bash
# line comment
set -euo pipefail
shopt -s nullglob globstar

readonly VERSION="1.2.3"
declare -A MAP=([k1]=v1 [k2]="v 2")
declare -a ARR=(one "two words" 'three' $'esc\tansi')
export PATH="$HOME/bin:${PATH:-/usr/bin}"
COUNT=0x1F
NAME='single literal \n'
MSG="dq: $NAME ${NAME}s ${#ARR[@]} ${ARR[1]} ${NAME:-def} ${NAME//a/b} \"esc\" \$lit \\ \n"
CMD_OUT="$(git rev-parse --short HEAD)"
SUM=$(( COUNT * 2 + ${#ARR[@]} ))
TMP="$(mktemp -d)"
x="${1-}"
ARR+=(four)
printf '%s\n' "$MSG" "$CMD_OUT" "$SUM" "${MAP[k1]}"

log() {
    local level="$1"; shift
    printf '[%s] %s\n' "$level" "$*" >&2
}

function cleanup {
    rm -rf -- "${TMP:?}"
}
trap cleanup EXIT INT TERM

if [[ -f "$x" && -n "${2-}" || $x =~ ^[0-9]+$ ]]; then
    echo "file"
elif [ "${#ARR[@]}" -eq 3 ] && (( COUNT > 2 )); then
    echo "num"
else
    echo "none"
fi

for f in src/**/*.{cpp,hpp} ./*.txt; do
    [[ -e $f ]] || continue
    echo "$f"
done

for ((i = 0; i < 10; i++)); do
    (( i % 2 )) && continue
    echo "$i"
done

while IFS=: read -r user _ uid _; do
    echo "$user:$uid"
done < /etc/passwd

until [[ -d "$TMP" ]]; do
    sleep 1
done

case "$x" in
    start|run) log INFO "starting" ;;
    stop)      log WARN "stopping"; exit 1 ;;
    -h|--help) echo "usage" ;;
    *)         echo "unknown: $x" >&2 ;;
esac

cat <<EOF2
unquoted heredoc: $VERSION $(date) \$escaped
EOF2

cat <<-'RAW'
	quoted heredoc: $VERSION $(not_run)
	RAW

grep -E "pat" <<< "here-string" | sort -u | head -n 5 > out.txt 2>&1
diff <(sort a) <(sort b) &>/dev/null || true
find . -name '*.o' -print0 | xargs -0 rm -f &
long_command --flag \
    --other="value" \
    -x 3

echo ~ ~/x "${HOME}" $? $$ $! $# "$@" "$*" "$0" "$1" "${10}"
echo {1..5} {a,b,c} file{1,2}.txt
[ -n "${X-}" ] && echo yes
exec 3>&1

# shellcheck source=/dev/null
source ./lib.sh
# shellcheck source=/dev/null
. ./other.sh
