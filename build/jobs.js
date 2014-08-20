var Job, Jobs, MongoClient, ObjectID, async, log, mongodb, path,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

log = require('log4node');

async = require('async');

mongodb = require('mongodb');

path = require('path');

Job = require(path.join(__dirname, 'job'));

MongoClient = mongodb.MongoClient;

ObjectID = mongodb.ObjectID;

Jobs = (function() {
  function Jobs(CONFIG) {
    this.run = __bind(this.run, this);
    this.updateClient = __bind(this.updateClient, this);
    this.removeJob = __bind(this.removeJob, this);
    this.getJobs = __bind(this.getJobs, this);
    this.CONFIG = CONFIG;
    this.MONGOHQ_URL = this.CONFIG.MONGOHQ_URL;
    this.DECRYPTION_KEY = this.CONFIG.DECRYPTION_KEY;
  }

  Jobs.prototype.getJobs = function(callback) {
    return MongoClient.connect(this.MONGOHQ_URL, (function(_this) {
      return function(err, db) {
        var collection;
        if (err) {
          return callback(err);
        }
        collection = db.collection("jobs");
        return collection.find({
          status: 'queued'
        }).toArray(function(err, jobs) {
          if (err) {
            return callback(err);
          }
          db.close();
          return callback(null, jobs);
        });
      };
    })(this));
  };

  Jobs.prototype.removeJob = function(job, callback) {
    return MongoClient.connect(this.MONGOHQ_URL, (function(_this) {
      return function(err, db) {
        var collection;
        if (err) {
          return callback(err);
        }
        collection = db.collection("jobs");
        return collection.update({
          _id: job._id
        }, {
          $set: {
            status: 'completed',
            finished: new Date()
          }
        }, function(err, job) {
          if (err) {
            return callback(err);
          }
          db.close();
          return callback(null, job);
        });
      };
    })(this));
  };

  Jobs.prototype.updateClient = function(client, callback) {
    return MongoClient.connect(this.MONGOHQ_URL, (function(_this) {
      return function(err, db) {
        var collection;
        if (err) {
          return callback(err);
        }
        collection = db.collection("clients");
        return collection.update({
          _id: client._id
        }, {
          $set: {
            servers: client.servers
          }
        }, function(err, client) {
          if (err) {
            return callback(err);
          }
          db.close();
          return callback(null, client);
        });
      };
    })(this));
  };


  /*
  Executes all the jobs within the queue
   */

  Jobs.prototype.run = function(runCallback) {
    return this.getJobs((function(_this) {
      return function(err, jobs) {
        return async.eachSeries(jobs, (function(job_opts, callback) {
          var job;
          job = new Job(job_opts, _this.CONFIG);
          log.info("Now executing job " + job._id);
          return job.execute(function(err, client) {
            if (err) {
              return callback(err);
            }
            log.info("Finished job " + job._id);
            return _this.removeJob(job, function(err) {
              if (err) {
                return callback(err);
              }
              return _this.updateClient(client, function(err) {
                if (err) {
                  return callback(err);
                }
                log.info("Client " + job.client + " updated for job " + job._id);
                return callback(null);
              });
            });
          });
        }), function(err) {
          if (err) {
            return runCallback(err);
          }
          log.info("All jobs finished without error!");
          return runCallback(null, jobs);
        });
      };
    })(this));
  };

  return Jobs;

})();

module.exports = Jobs;
