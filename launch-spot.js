const fs = require('fs');
const zlib = require('zlib');
const AWS = require('aws-sdk');
const async = require('async');

function main() {
  var config = JSON.parse(fs.readFileSync("config.json"))

  var ec2 = new AWS.EC2({'accessKeyId':config.accessKeyId, 'secretAccessKey':config.secretAccessKey,
                         'region':config.region});
  var bid = JSON.parse(fs.readFileSync(process.argv[2]))
  var LaunchSpecification = JSON.parse(fs.readFileSync(process.argv[3]))
  
  async.waterfall([ function(callback) {
                      bid['LaunchSpecification'] = LaunchSpecification;
                      ec2.requestSpotInstances(bid, callback);
                    },
                    function(data, callback) {
                      console.log(JSON.stringify(data))
                      function waitForPending(data, callback) {
                        if (data.Status.Code == "fulfilled") {
                          console.log('fulfilled', data);
                          return callback(null, data.InstanceId);
                        }
                        setTimeout(function () {
                                     var cfg = {'SpotInstanceRequestIds':[data.SpotInstanceRequestId]}
                                     ec2.describeSpotInstanceRequests(cfg,
                                                                     function (err, data) {
                                                                       if (err)
                                                                         return callback(err);
                                                                       data = data.SpotInstanceRequests[0];
                                                                       waitForPending(data, callback);
                                                                     });
                                   }, 2000);
                      }
                      async.map(data.SpotInstanceRequests, waitForPending, callback);
                    },
                    function(instanceIds, callback) {
                      console.log(instanceIds);
                      ec2.describeInstances({'InstanceIds':instanceIds}, callback);
                    },
                    function (data, callback) {
                      console.log(JSON.stringify(data));
                      function retry(err, data) {
                        if (err)
                          return callback(err);
                        console.log(JSON.stringify(data));
                        var finished = data.Instances.filter(function(x) {return typeof(x.PublicDnsName) != 'string'}).length == 0;
                        if (!finished) {
                          var instanceIds = data.Instances.map(function(x) {return x.InstanceId});
                          ec2.describeInstances({'InstanceIds':instanceIds}, function (err, data) {
                                                  if (err)
                                                    return callback(err);
                                                  data.Reservations.forEach(function(x) {retry(null, x)});                                     
                                                });
                        } else {
                          callback(null, data.Instances.map(function(x) {return x.PublicDnsName}));
                        }
                      }
                      data.Reservations.forEach(function(x) {retry(null, x)});
                    }
                  ],
                  function (err, result) {
                    if (err)
                      throw err
                    console.log("all done:"+ JSON.stringify(result))
                  }
  )
}

main();
