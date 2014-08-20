request = require 'request'

# Get the webhook from the enviroment
webhookUrl = process.env.SLACK_NOTIFICATION_URL

# Defines the slack post
send = (text, color, callback) ->
    if !webhookUrl?
        console.warn "slack.send requires the following env variables: SLACK_NOTIFICATION_URL"
        return callback()

    options =
        uri: webhookUrl
        method: 'POST'
        json: { text: text, color: color }

    request options, () ->
        return callback() if callback

    return

module.exports.send = send
