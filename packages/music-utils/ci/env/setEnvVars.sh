#!/bin/sh
echo "Setting ENV VARS"
export MU_TEST_DIR=$PWD/test-data
export MU_TEST_ZEP_1="$MU_TEST_DIR/copy/Led Zeppelin/1976 The Song Remains The Same (Disc 1∕2)"
export MU_TEST_ZEP_2="$MU_TEST_DIR/copy/Led Zeppelin/1976 The Song Remains The Same (Disc 2∕2)"
export MU_TEST_ACC="$MU_TEST_DIR/copy/Accept/1996 Predator"
export MU_BUILD_DIR=$PWD/build
#export MU_BUILD_DIR_CI=$PWD/build.ci

echo "MU_TEST_DIR = $MU_TEST_DIR"
echo "MU_TEST_ZEP_1 = $MU_TEST_ZEP_1"
echo "MU_TEST_ZEP_2 = $MU_TEST_ZEP_2"
echo "MU_TEST_ACC = $MU_TEST_ACC"
echo "MU_BUILD_DIR = $MU_BUILD_DIR"
#echo "MU_BUILD_DIR_CI = $MU_BUILD_DIR_CI"
