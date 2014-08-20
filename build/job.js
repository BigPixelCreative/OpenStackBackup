var Job, MongoClient, ObjectID, async, log, mongodb, parsel, pkgcloud, serverToJSON, sleep, _,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

pkgcloud = require('pkgcloud');

parsel = require('parsel');

log = require('log4node');

async = require('async');

_ = require('underscore');

mongodb = require('mongodb');

sleep = require('sleep');

MongoClient = mongodb.MongoClient;

ObjectID = mongodb.ObjectID;

serverToJSON = function() {
  return {
    id: this.id,
    name: this.name,
    status: this.status,
    hostId: this.hostId,
    addresses: this.addresses,
    progress: this.progress,
    flavor: this.flavorId,
    image: this.imageId,
    created: this.created,
    updated: this.updated
  };
};

Job = (function() {
  function Job(opts, CONFIG) {
    this.execute = __bind(this.execute, this);
    this.action_delete_image = __bind(this.action_delete_image, this);
    this.action_create_image = __bind(this.action_create_image, this);
    this.action_wrap_run = __bind(this.action_wrap_run, this);
    this.action_restore_server = __bind(this.action_restore_server, this);
    this.action_delete_server = __bind(this.action_delete_server, this);
    this.get_compute_client = __bind(this.get_compute_client, this);
    this.client_server_update = __bind(this.client_server_update, this);
    this.get_client = __bind(this.get_client, this);
    this._id = opts._id;
    this.type = opts.type;
    this.client = opts.client;
    this.MONGOHQ_URL = CONFIG.MONGOHQ_URL;
    this.DECRYPTION_KEY = CONFIG.DECRYPTION_KEY;
    this.log = new log.Log4Node({
      level: 'debug'
    });
    this.log.setPrefix("[%d] <" + (this._id.toHexString()) + ":" + this.type + "> %l ");
    this.opts = opts;
  }

  Job.prototype.get_client = function(callback) {
    return MongoClient.connect(this.MONGOHQ_URL, (function(_this) {
      return function(err, db) {
        var collection;
        if (err) {
          return callback(err);
        }
        collection = db.collection("clients");
        return db.collection("clients").findOne(new ObjectID(_this.client), function(err, client) {
          if (err) {
            return callback(err);
          }
          db.close();
          callback(null, client);
        });
      };
    })(this));
  };

  Job.prototype.client_server_update = function(client, callback) {
    return this.compute_client.getServers((function(_this) {
      return function(err, servers) {
        var attrname, attrvalue, client_server, current_server_ids, grouped_servers, new_server, new_servers, old_server, _i, _j, _len, _len1, _ref, _ref1;
        if (err) {
          return callback(err);
        }
        servers = _.map(servers, function(server) {
          server.flavor = server.flavorId;
          server.image = server.imageId;
          return server;
        });
        current_server_ids = _.pluck(client.servers, 'id');
        new_servers = _.reject(servers, function(server) {
          return _.some(current_server_ids, function(current_server_id) {
            return current_server_id === server.id;
          });
        });
        grouped_servers = _.groupBy(servers, function(server) {
          var already_in_list;
          already_in_list = _.some(current_server_ids, function(current_server_id) {
            return current_server_id === server.id;
          });
          if (already_in_list) {
            return 'old';
          } else {
            return 'new';
          }
        });
        if (grouped_servers.old != null) {
          _ref = grouped_servers.old;
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            old_server = _ref[_i];
            old_server.toJSON = serverToJSON;
            client_server = _.findWhere(client.servers, {
              id: old_server.id
            });
            old_server = old_server.toJSON();
            for (attrname in old_server) {
              attrvalue = old_server[attrname];
              client_server[attrname] = attrvalue;
            }
          }
        }
        if (grouped_servers["new"] != null) {
          _ref1 = grouped_servers["new"];
          for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
            new_server = _ref1[_j];
            new_server.toJSON = serverToJSON;
            new_server.backups = [];
            client.servers.push(new_server.toJSON());
          }
        }
        return callback(null, client);
      };
    })(this));
  };

  Job.prototype.get_compute_client = function(client) {
    var decryptedPassword;
    decryptedPassword = parsel.decrypt(this.DECRYPTION_KEY, client.account.password);
    this.clientOptions = {
      provider: 'openstack',
      authUrl: client.account.authUrl,
      region: client.account.region,
      username: client.account.userName,
      password: decryptedPassword
    };
    return pkgcloud.compute.createClient(this.clientOptions);
  };

  Job.prototype.action_delete_server = function(client, callback) {
    this.log.info("Starting destroy of server");
    return this.compute_client.destroyServer(this.opts.server, (function(_this) {
      return function(err, destroyedServer) {
        if (err) {
          return callback([_this.opts, err]);
        }
        _this.log.info("Destroy complete for server " + _this.opts.server);
        client.servers = _.reject(client.servers, function(server) {
          return server.id === _this.opts.server;
        });
        return callback(null, client, false);
      };
    })(this));
  };

  Job.prototype.action_restore_server = function(client, callback) {
    var backup_id, old_server_id;
    old_server_id = this.opts.server;
    backup_id = this.opts.image;
    return this.compute_client.getServer(old_server_id, (function(_this) {
      return function(err, server) {
        if (err) {
          return callback([_this.opts, err]);
        }
        _this.log.info("Got old server.");
        return _this.compute_client.getImage(backup_id, function(err, image) {
          var new_server;
          new_server = {
            image: backup_id,
            flavor: server.flavorId,
            name: image.name
          };
          _this.log.info("Got image to restore from.");
          return _this.compute_client.createServer(new_server, function(err, new_server) {
            if (err) {
              return callback([_this.opts, err]);
            }
            new_server.toJSON = serverToJSON;
            client.servers.push(new_server.toJSON());
            _this.log.info("New server created.");
            return _this.compute_client.getFloatingIps(function(err, ips) {
              var ip, server_floating_ip, _i, _len;
              server_floating_ip = null;
              for (_i = 0, _len = ips.length; _i < _len; _i++) {
                ip = ips[_i];
                if (ip.instance_id === old_server_id) {
                  server_floating_ip = ip;
                  break;
                }
              }
              if (server_floating_ip != null) {
                _this.log.info("Found ip with matching instance: " + server_floating_ip);
                return _this.compute_client.removeFloatingIp(old_server_id, server_floating_ip, function(err) {
                  var finished_adding_ip;
                  if (err) {
                    return callback([_this.opts, err]);
                  }
                  _this.log.info("Removed ip from old instance.");
                  finished_adding_ip = false;
                  return async.doUntil((function(doUntilCallback) {
                    return _this.compute_client.addFloatingIp(new_server, server_floating_ip, function(err) {
                      if (err) {
                        _this.log.error("Failed adding ip, retrying in 20 seconds...");
                        sleep.sleep(20);
                        _this.log.info("Retrying...");
                      } else {
                        _this.log.info("Added ip to new instance.");
                        finished_adding_ip = true;
                      }
                      return doUntilCallback();
                    });
                  }), (function() {
                    return finished_adding_ip;
                  }), function(err) {
                    if (err) {
                      return callback([_this.opts, err]);
                    }
                    return callback(null, client);
                  });
                });
              } else {
                _this.log.error("No matching ip with the right instance id.");
                return callback(null, client);
              }
            });
          });
        });
      };
    })(this));
  };

  Job.prototype.action_wrap_run = function(client, callback) {
    return this["action_" + this.type](client, (function(_this) {
      return function(err, client, run_update) {
        if (run_update == null) {
          run_update = true;
        }
        if (err) {
          return callback(err);
        }
        if (run_update) {
          return _this.client_server_update(client, callback);
        } else {
          return callback(null, client);
        }
      };
    })(this));
  };

  Job.prototype.action_create_image = function(client, callback) {
    this.log.info("Starting snapshot for server " + this.opts.server);
    return this.compute_client.createImage({
      name: this.opts.name,
      server: this.opts.server
    }, (function(_this) {
      return function(err, image) {
        var other_servers, server;
        if (err) {
          return callback([_this.opts, err]);
        }
        _this.log.info("Finished snapshot for server " + _this.opts.server);
        server = _.findWhere(client.servers, {
          id: _this.opts.server
        });
        other_servers = _.reject(client.servers, function(server) {
          return server.id === _this.opts.server;
        });
        if (server.backups == null) {
          server.backups = [];
        }
        server.backups.push({
          id: image.id,
          name: image.name,
          created: image.created
        });
        other_servers.push(server);
        client.servers = other_servers;
        return callback(null, client);
      };
    })(this));
  };

  Job.prototype.action_delete_image = function(client, callback) {
    this.log.info("Started deletion of image " + this.opts.image);
    return this.compute_client.destroyImage(this.opts.image, (function(_this) {
      return function(err) {
        var other_servers, server, srv, _i, _len, _ref;
        if (err && err.statusCode === !404) {
          return callback([_this.opts, err]);
        }
        _this.log.info("Finished deletion of image " + _this.opts.image + " for server " + _this.opts.server);
        server = null;
        _ref = client.servers;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          srv = _ref[_i];
          if (srv.id === _this.opts.server) {
            server = srv;
            break;
          }
        }
        other_servers = _.reject(client.servers, function(server) {
          return server.id === _this.opts.server;
        });
        server.backups = _.reject(server.backups, function(backup) {
          return backup.id === _this.opts.image;
        });
        other_servers.push(server);
        client.servers = other_servers;
        return callback(null, client);
      };
    })(this));
  };

  Job.prototype.execute = function(callback) {
    return this.get_client((function(_this) {
      return function(err, client) {
        if (err) {
          return callback([_this.opts, err]);
        }
        _this.compute_client = _this.get_compute_client(client);
        _this.action_wrap_run(client, callback);
      };
    })(this));
  };

  return Job;

})();

module.exports = Job;
