#!/bin/bash
cd "$(dirname "$0")"
git add -A
git commit -m "log $(date '+%Y/%m/%d %H:%M:%S')"
git push origin master
