#!/bin/sh
DATA=`pwd`/data/github-commits.js
pushd ~/workspace/gaia
git pull -u
echo "var GITHUB_COMMITS = [" > $DATA
git log --pretty=format:"%ad %s" --date=iso | tr -d "\"" | sed -n -e 's/\(.*\)/"\1",/p' | sed -e 's/\\\(uXXXX\)/\1/' >> $DATA
echo "];" >> $DATA
