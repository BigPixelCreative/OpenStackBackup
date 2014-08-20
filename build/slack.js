var request, send, webhookUrl;

request = require('request');

webhookUrl = process.env.SLACK_NOTIFICATION_URL;

send = function(text, color, callback) {
  var options;
  if (webhookUrl == null) {
    console.warn("slack.send requires the following env variables: SLACK_NOTIFICATION_URL");
    return callback();
  }
  options = {
    uri: webhookUrl,
    method: 'POST',
    json: {
      text: text,
      color: color
    }
  };
  request(options, function() {
    if (callback) {
      return callback();
    }
  });
};

module.exports.send = send;
