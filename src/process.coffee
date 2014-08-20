Jobs = require './jobs'
Queue = require './queue'

slack = require './slack'
mandrill = require './mandrill'

log = require 'log4node'
argv = require('optimist').argv

CONFIG =
    MONGOHQ_URL: process.env.MONGOHQ_URL
    DECRYPTION_KEY: process.env.DECRYPTION_KEY

# Create new objects
queue = new Queue CONFIG
jobs = new Jobs CONFIG

# Sends the notifications via slack and mandrill
sendNotifications = (error, message) ->
    # Log this out
    log.error(error) if error
    log.info(message) if message

    # Send the email
    send_message = if error? then error else message

    mandrill.send send_message, error?, (message) ->
        # Then notify via slack
        color = if error? then "danger" else "good"
        slack.send message.text, color

    return

if argv.queue and argv.process
    queue.queueClients (err, queued_jobs) ->
        return sendNotifications(err) if err

        jobs.run (err, jobs) ->
            return sendNotifications(err) if err

            if jobs.length > 0
                sendNotifications null, "Just queued #{queued_jobs.length} and finished #{jobs.length} jobs! All jobs finished without erro!"
            else
                sendNotifications null, "Just queued #{queued_jobs.length} and no jobs were in the queue. No errors occured."

else if argv.queue
    queue.queueClients (err, jobs) ->
        return sendNotifications(err) if err

        sendNotifications null, "Just queued #{jobs.length} jobs."

else if argv.process
    jobs.run (err, jobs) ->
        return sendNotifications(err) if err

        if jobs.length > 0
            sendNotifications null, "Just finished #{jobs.length} jobs! All jobs finished without error!"

else
    console.log(
        "process.js\n\n"
        "--queue\n\tAdds to the queue, if both --process and --queue are speciefied, then this is run first\n"
        "--process\n\tProcesses the current queue"
    )
