const fs = require('fs');
var btoa = require('btoa');
var atob = require('atob');
if (process.argv.length != 4) {
  console.log("usage: nodejs encode-user-data.js <config> <userdata> > config_with_userdata")
  process.exit(1);
}

var configFile = process.argv[2];
var userDataFile = process.argv[3];
var config = JSON.parse(fs.readFileSync(configFile));
var userData = fs.readFileSync(userDataFile);

config.UserData = btoa(userData);
console.log(JSON.stringify(config))
