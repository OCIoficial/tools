# OCI Tools

Some tools to help with the set up of contests

## cms-tools

Script containing some commands useful to configure CMS.

## cms-load-test-jmeter.jmx

A simple JMeter load test for CMS Contest Web Service. This is meant to be a starting point in case a more robust test is required. There are some _User Defined Variables_ that you should configure before running it:

* HOSTNAME: address running the contest
* PORT: port running the contest
* USERNAME: the username of a user in the contest
* PASSWORD: the password of a user in the contest
* PROBLEM1: the name of one problem
* PROBLEM2: the name of a second problem
