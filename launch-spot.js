const fs = require('fs');
const zlib = require('zlib');
const AWS = require('aws-sdk');
const async = require('async');

function main() {
  var start = new Date();
  var config = JSON.parse(fs.readFileSync("config.json"))

  var ec2 = new AWS.EC2({'accessKeyId':config.accessKeyId, 'secretAccessKey':config.secretAccessKey,
                         'region':config.region});
  if (process.argv.length != 3 && process.argv.length != 4) {
    console.log("Usage: nodejs launch-spot.js <nodespec> <bidspec optional>");
    process.exit(1);
  }

  var LaunchSpecification = JSON.parse(fs.readFileSync(process.argv[2]))
  var bid = null;
  var steps = []
  // ************** BID 
  if (process.argv.length == 4) {
    bid = JSON.parse(fs.readFileSync(process.argv[3]))
    steps.push(
      function(callback) {
        bid['LaunchSpecification'] = LaunchSpecification;
        ec2.requestSpotInstances(bid, callback);
      },
      function(data, callback) {
        function waitForPending(data, callback) {
          //console.log(JSON.stringify(data))
          var status = data.Status.Code
          if (status.indexOf("pending-") == 0) {
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
          } else if (status == "fulfilled") {
            console.log('fulfilled');
            return callback(null, data.InstanceId);
          } else {
            return callback("spot req rejected with ("+status+")", JSON.stringify(data));
          }
        }
        async.map(data.SpotInstanceRequests, waitForPending, callback);
      });
    // ***************** launch normal ONDEMAND
  } else {
    steps.push(
      function(callback) {
        LaunchSpecification['MinCount'] = 1;
        LaunchSpecification['MaxCount'] = 1;
        ec2.runInstances(LaunchSpecification, callback);
      },
      function(data, callback) {
        callback(null, data.Instances.map(function(x) {return x.InstanceId}))
      }
    )
  }
  // ******************** REST of the steps
  steps.push(
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
          setTimeout(function() {
                       var instanceIds = data.Instances.map(function(x) {return x.InstanceId});
                       ec2.describeInstances({'InstanceIds':instanceIds}, function (err, data) {
                                               if (err)
                                                 return callback(err);
                                               data.Reservations.forEach(function(x) {retry(null, x)});                                     
                                             })}, 2000);
        } else {
          callback(null, data.Instances.map(function(x) {return [x.InstanceId, x.PublicIpAddress]}));
        }
      }
      data.Reservations.forEach(function(x) {retry(null, x)});
    }
  )
  async.waterfall(steps,
                  function (err, result) {
                    if (err)
                      throw err
                    console.log("launched in "+(new Date() - start)+"ms :"+ JSON.stringify(result))
                  }
  )
}

main();
