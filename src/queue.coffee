_ = require 'underscore'
mongodb = require 'mongodb'
moment = require 'moment'

MongoClient = mongodb.MongoClient

BACKUP_AGE = moment().subtract 2, "w"
RECENT_AGE = moment().subtract 5, "d"

class Client
    constructor: (client) ->
        @client = client

    getQueuedForTime: ->
        difference = (Math.floor(moment().minute() / 10) * 10 + 10) - moment().minute()
        moment().add('minutes', difference).second(0).millisecond(0).toDate()

    queueAllInstancesForBackup: (allInstancesBackupCallback) =>
        # Find all instances where the backups are enabled
        servers_to_backup = _.filter @client.servers, (server) ->
            server.backups_enabled is true

        _.map servers_to_backup, (server) =>
            type: "create_image"
            status: 'queued'
            client: @client._id.toHexString()
            server: server.id
            name: "#{server.name} - Backup #{moment().format("MMMM, D YYYY")}"
            created: new Date()
            queued_for: @getQueuedForTime()

    queueAllOldImagesForDeletion: (allServersBackupDeleteCallback) =>
        _.map @client.servers, (server) =>
            # Get all backups that need to be removed
            backups = _.filter server.backups, (backup) =>
                # Get timestamp
                timeStamp = moment backup.created

                # Return if it needs to be removed
                BACKUP_AGE.isAfter(timeStamp) or RECENT_AGE.isBefore(timeStamp)

            # Turn these into jobs, and return
            _.map backups, (backup) =>
                type: "delete_image"
                status: 'queued'
                client: @client._id.toHexString()
                server: server.id
                image: backup.id
                created: new Date()
                queued_for: @getQueuedForTime()

    performQueueing: ->
        # Perform sync queueing
        [
            @queueAllInstancesForBackup()
            @queueAllOldImagesForDeletion()
        ]

class Queue
    constructor: (CONFIG) ->
        @CONFIG = CONFIG
        @MONGOHQ_URL = @CONFIG.MONGOHQ_URL

    getClients: (callback) =>
        MongoClient.connect @MONGOHQ_URL, (err, db) =>
            return callback(err) if err

            # Get clients collection
            collection = db.collection "clients"

            # Find all the clients
            collection.find().toArray (err, clients) =>
                return callback(err) if err

                # Close the database connection
                db.close()

                # Return the clients
                callback null, clients

    getJobs: (callback) =>
        MongoClient.connect @MONGOHQ_URL, (err, db) =>
            return callback(err) if err

            # Get clients collection
            collection = db.collection "jobs"

            # Find all the clients
            collection.find({ status: 'queued' }).toArray (err, jobs) =>
                return callback(err) if err

                # Close the database connection
                db.close()

                # Return the jobs
                callback null, jobs

    queueClients: (finishedQueueingClientsCallback) =>
        @getJobs (err, current_jobs) =>
            return finishedQueueingClientsCallback(err) if err

            # Get all the clients
            @getClients (err, clients) =>
                return finishedQueueingCallback(err) if err

                jobs = _.flatten _.map clients, (client) ->

                    clientObject = new Client client

                    # Returns the clients jobs
                    clientObject.performQueueing()

                # Filter these jobs to ensure the job is not already in the queue
                jobs = _.filter jobs, (job) ->
                    found_delete_job = _.findWhere current_jobs, {
                        type: 'delete_image'
                        client: job.client
                        server: job.server
                        image: job.image
                    }

                    found_create_job = _.findWhere current_jobs, {
                        type: 'create_image'
                        client: job.client
                        server: job.server
                    }

                    _.isUndefined(found_delete_job) and _.isUndefined(found_create_job)

                if jobs.length > 0

                    # All jobs are ready to be added to the database
                    MongoClient.connect @MONGOHQ_URL, (err, db) ->
                        return finishedQueueingClientsCallback(err) if err

                        # Get jobs collection
                        collection = db.collection "jobs"

                        # Insert the new jobs
                        collection.insert jobs, { w: 1 }, (err, jobs) ->
                            return finishedQueueingClientsCallback(err) if err

                            db.close()

                            # Finished jobs!
                            finishedQueueingClientsCallback null, jobs

                else
                    # No jobs to add!
                    finishedQueueingClientsCallback null, jobs

module.exports = Queue
