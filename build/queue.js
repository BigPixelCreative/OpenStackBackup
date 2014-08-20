var BACKUP_AGE, Client, MongoClient, Queue, RECENT_AGE, moment, mongodb, _,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

_ = require('underscore');

mongodb = require('mongodb');

moment = require('moment');

MongoClient = mongodb.MongoClient;

BACKUP_AGE = moment().subtract(2, "w");

RECENT_AGE = moment().subtract(5, "d");

Client = (function() {
  function Client(client) {
    this.queueAllOldImagesForDeletion = __bind(this.queueAllOldImagesForDeletion, this);
    this.queueAllInstancesForBackup = __bind(this.queueAllInstancesForBackup, this);
    this.client = client;
  }

  Client.prototype.getQueuedForTime = function() {
    var difference;
    difference = (Math.floor(moment().minute() / 10) * 10 + 10) - moment().minute();
    return moment().add('minutes', difference).second(0).millisecond(0).toDate();
  };

  Client.prototype.queueAllInstancesForBackup = function(allInstancesBackupCallback) {
    var servers_to_backup;
    servers_to_backup = _.filter(this.client.servers, function(server) {
      return server.backups_enabled === true;
    });
    return _.map(servers_to_backup, (function(_this) {
      return function(server) {
        return {
          type: "create_image",
          status: 'queued',
          client: _this.client._id.toHexString(),
          server: server.id,
          name: "" + server.name + " - Backup " + (moment().format("MMMM, D YYYY")),
          created: new Date(),
          queued_for: _this.getQueuedForTime()
        };
      };
    })(this));
  };

  Client.prototype.queueAllOldImagesForDeletion = function(allServersBackupDeleteCallback) {
    return _.map(this.client.servers, (function(_this) {
      return function(server) {
        var backups;
        backups = _.filter(server.backups, function(backup) {
          var timeStamp;
          timeStamp = moment(backup.created);
          return BACKUP_AGE.isAfter(timeStamp) || RECENT_AGE.isBefore(timeStamp);
        });
        return _.map(backups, function(backup) {
          return {
            type: "delete_image",
            status: 'queued',
            client: _this.client._id.toHexString(),
            server: server.id,
            image: backup.id,
            created: new Date(),
            queued_for: _this.getQueuedForTime()
          };
        });
      };
    })(this));
  };

  Client.prototype.performQueueing = function() {
    return [this.queueAllInstancesForBackup(), this.queueAllOldImagesForDeletion()];
  };

  return Client;

})();

Queue = (function() {
  function Queue(CONFIG) {
    this.queueClients = __bind(this.queueClients, this);
    this.getJobs = __bind(this.getJobs, this);
    this.getClients = __bind(this.getClients, this);
    this.CONFIG = CONFIG;
    this.MONGOHQ_URL = this.CONFIG.MONGOHQ_URL;
  }

  Queue.prototype.getClients = function(callback) {
    return MongoClient.connect(this.MONGOHQ_URL, (function(_this) {
      return function(err, db) {
        var collection;
        if (err) {
          return callback(err);
        }
        collection = db.collection("clients");
        return collection.find().toArray(function(err, clients) {
          if (err) {
            return callback(err);
          }
          db.close();
          return callback(null, clients);
        });
      };
    })(this));
  };

  Queue.prototype.getJobs = function(callback) {
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

  Queue.prototype.queueClients = function(finishedQueueingClientsCallback) {
    return this.getJobs((function(_this) {
      return function(err, current_jobs) {
        if (err) {
          return finishedQueueingClientsCallback(err);
        }
        return _this.getClients(function(err, clients) {
          var jobs;
          if (err) {
            return finishedQueueingCallback(err);
          }
          jobs = _.flatten(_.map(clients, function(client) {
            var clientObject;
            clientObject = new Client(client);
            return clientObject.performQueueing();
          }));
          jobs = _.filter(jobs, function(job) {
            var found_create_job, found_delete_job;
            found_delete_job = _.findWhere(current_jobs, {
              type: 'delete_image',
              client: job.client,
              server: job.server,
              image: job.image
            });
            found_create_job = _.findWhere(current_jobs, {
              type: 'create_image',
              client: job.client,
              server: job.server
            });
            return _.isUndefined(found_delete_job) && _.isUndefined(found_create_job);
          });
          if (jobs.length > 0) {
            return MongoClient.connect(_this.MONGOHQ_URL, function(err, db) {
              var collection;
              if (err) {
                return finishedQueueingClientsCallback(err);
              }
              collection = db.collection("jobs");
              return collection.insert(jobs, {
                w: 1
              }, function(err, jobs) {
                if (err) {
                  return finishedQueueingClientsCallback(err);
                }
                db.close();
                return finishedQueueingClientsCallback(null, jobs);
              });
            });
          } else {
            return finishedQueueingClientsCallback(null, jobs);
          }
        });
      };
    })(this));
  };

  return Queue;

})();

module.exports = Queue;
