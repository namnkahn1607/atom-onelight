#!/usr/bin/env bash
# shellcheck disable=all

echo "nested $(echo "inner $(echo "deep")") after"
echo $((1 + $(echo 2)))
echo "${arr[$((i + 1))]}"
x=$(case $y in a) echo 1 ;; esac)
echo 'single $not_var $(not_cmd) \n'
echo 'it'"'"'s'
echo "unclosed paren in string: )"
OLD_STYLE=`date +%s`
echo `echo \`echo nested\``
echo $@ $* $1 ${10} $#
echo "${var:-"nested dq"}"
echo ${var:+x} ${var:?err} ${var%%.*} ${var^^} ${!prefix@}
cat <<A <<B
first
A
second
B
cat <<"QUOTED" | grep x
$not_expanded `not_run`
QUOTED
[[ $a == *.txt ]] && [[ $b =~ ^(a|b)+$ ]] || [ "$c" = "d" ]
if true; then echo ok; fi; echo "after if"
function weird-name() { echo hi; }
a=1 b=2 command arg
declare -A m=([key with space]=v)
echo $'\x41\u00e9\n'
echo $"locale string"
: "${VAR:=default}"
echo # not a comment-start in: a#b a\#b
echo a#b "# inside string"
