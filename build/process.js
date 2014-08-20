var CONFIG, Jobs, Queue, argv, jobs, log, mandrill, queue, sendNotifications, slack;

Jobs = require('./jobs');

Queue = require('./queue');

slack = require('./slack');

mandrill = require('./mandrill');

log = require('log4node');

argv = require('optimist').argv;

CONFIG = {
  MONGOHQ_URL: process.env.MONGOHQ_URL,
  DECRYPTION_KEY: process.env.DECRYPTION_KEY
};

queue = new Queue(CONFIG);

jobs = new Jobs(CONFIG);

sendNotifications = function(error, message) {
  var send_message;
  if (error) {
    log.error(error);
  }
  if (message) {
    log.info(message);
  }
  send_message = error != null ? error : message;
  mandrill.send(send_message, error != null, function(message) {
    var color;
    color = error != null ? "danger" : "good";
    return slack.send(message.text, color);
  });
};

if (argv.queue && argv.process) {
  queue.queueClients(function(err, queued_jobs) {
    if (err) {
      return sendNotifications(err);
    }
    return jobs.run(function(err, jobs) {
      if (err) {
        return sendNotifications(err);
      }
      if (jobs.length > 0) {
        return sendNotifications(null, "Just queued " + queued_jobs.length + " and finished " + jobs.length + " jobs! All jobs finished without erro!");
      } else {
        return sendNotifications(null, "Just queued " + queued_jobs.length + " and no jobs were in the queue. No errors occured.");
      }
    });
  });
} else if (argv.queue) {
  queue.queueClients(function(err, jobs) {
    if (err) {
      return sendNotifications(err);
    }
    return sendNotifications(null, "Just queued " + jobs.length + " jobs.");
  });
} else if (argv.process) {
  jobs.run(function(err, jobs) {
    if (err) {
      return sendNotifications(err);
    }
    if (jobs.length > 0) {
      return sendNotifications(null, "Just finished " + jobs.length + " jobs! All jobs finished without error!");
    }
  });
} else {
  console.log("process.js\n\n", "--queue\n\tAdds to the queue, if both --process and --queue are speciefied, then this is run first\n", "--process\n\tProcesses the current queue");
}
