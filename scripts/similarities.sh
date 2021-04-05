#!/bin/sh

################################################################################  
#   Usage : 
#   /root-or-somewhere>  ./scripts/similarities.sh -A /path/to/origin/ -B /path/to/comparator/ -T 0.5  -Q > output.table

# Where -A is dir1, -B is dir2, T is threshold of equality and Q is quiet

################################################################################ 


BASEDIR=$(dirname "$0")
node $BASEDIR/../build/run/similarities.js "$@"

