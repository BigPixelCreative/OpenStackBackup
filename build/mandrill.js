var mandrill;

mandrill = require('mandrill-api/mandrill');

module.exports.send = function(message_text_value, error, callback) {
  var mandrill_client, message;
  if ((process.env.MANDRILL_TOKEN == null) || (process.env.TO_EMAIL == null) || (process.env.TO_NAME == null) || (process.env.FROM_EMAIL == null) || (process.env.FROM_NAME == null)) {
    console.warn("mandrill.send requires the following env variables: MANDRILL_TOKEN TO_EMAIL TO_NAME FROM_EMAIL FROM_NAME");
    return callback();
  }
  mandrill_client = new mandrill.Mandrill(process.env.MANDRILL_TOKEN);
  message = {
    to: [
      {
        email: process.env.TO_EMAIL,
        name: process.env.TO_NAME,
        type: "to"
      }
    ],
    from_email: process.env.FROM_EMAIL,
    from_name: process.env.FROM_NAME
  };
  if (error) {
    if (Object.prototype.toString.call(message_text_value) === "[object Array]") {
      message_text_value[0] = JSON.stringify(message_text_value[0]);
    }
    message.html = "<p>Backups failed with error: <b>" + message_text_value + "</b></p>";
    if (message_text_value.stack != null) {
      message.html += "<p><pre>" + message_text_value.stack + "</pre></p>";
    }
    message.text = "Backups failed with error: " + message_text_value;
    message.subject = "[OpenStackBackup] Backups Failed!";
    message.important = true;
  } else {
    message.html = "<p>" + message_text_value + "</p>";
    message.text = "" + message_text_value;
    message.subject = "[OpenStackBackup] Backups OK";
  }
  mandrill_client.messages.send({
    message: message,
    async: true
  });
  if (callback) {
    return callback(message);
  }
};
