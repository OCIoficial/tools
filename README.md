# tools
Some tools to help  with the setting of contests

## hosts.yaml.sample

Sample host configuration file to be used with `cms-tools.py` see below.

## cms.conf.sample

A sample `cms.conf` that can be used by `cms-tools.py` see below.

## cms-tools.py

Script containing some commands useful to configure cms in multiple hosts.

### Requirements

* python >= 3.6 
* PyYaml

### Usage

* First make a copy of `hosts.yaml.sample` and name it `hosts.yaml`. The file has some comments to help with the configuration.
* Run `cms-tools.py` without any arguments to read the help.

## cms-load-test-jmeter.jmx

A simple JMeter load test for CMS Contest Web Service. It basically signs in a couple of users and then do some requests with the users logged in. More than extensive test this is meant to be a starting point in case a more robust test is requried. There are some User Defined Variables that need to be configured before running it:
* HOSTNAME: address running the contest
* PORT: port running the contest
* USERNAME: the username of a user in the contest
* PASSWORD: the password of a user in the contest
* PROBLEM1: the name of one problem
* PROBLEM2: the name of a second problem
