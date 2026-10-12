#!/bin/bash
# drag.sh x1 y1 x2 y2 — SGR mouse drag in tmux session "atc"
x1=$1 y1=$2 x2=$3 y2=$4
E=$'\e'
tmux send-keys -t atc -l "${E}[<0;${x1};${y1}M"
sleep 0.1
tmux send-keys -t atc -l "${E}[<32;$(( (x1+x2)/2 ));${y2}M"
sleep 0.1
tmux send-keys -t atc -l "${E}[<32;${x2};${y2}M"
sleep 0.1
tmux send-keys -t atc -l "${E}[<0;${x2};${y2}m"
sleep 0.8

