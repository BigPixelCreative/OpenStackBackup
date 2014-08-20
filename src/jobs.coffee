log = require 'log4node'
async = require 'async'
mongodb = require 'mongodb'
path = require 'path'

Job = require path.join __dirname, 'job'

MongoClient = mongodb.MongoClient
ObjectID = mongodb.ObjectID

class Jobs
    constructor: (CONFIG) ->
        @CONFIG = CONFIG
        @MONGOHQ_URL = @CONFIG.MONGOHQ_URL
        @DECRYPTION_KEY = @CONFIG.DECRYPTION_KEY

    getJobs: (callback) =>
        # Connect to the database
        MongoClient.connect @MONGOHQ_URL, (err, db) =>
            return callback(err) if err

            # Get jobs collection
            collection = db.collection "jobs"

            # Get all the jobs
            collection.find({ status: 'queued' }).toArray (err, jobs) =>
                return callback(err) if err

                # Close the database connection
                db.close()

                # Return the jobs
                callback null, jobs

    removeJob: (job, callback) =>
        # Connect to the database
        MongoClient.connect @MONGOHQ_URL, (err, db) =>
            return callback(err) if err

            # Get jobs collection
            collection = db.collection "jobs"

            # Get all the jobs
            collection.update { _id: job._id }, { $set: { status: 'completed', finished: new Date() } }, (err, job) =>
                return callback(err) if err

                # Close the database
                db.close()

                # Job was removed!
                callback null, job

    # Update a clients server entries
    updateClient: (client, callback) =>
        # Connect to the database
        MongoClient.connect @MONGOHQ_URL, (err, db) =>
            return callback(err) if err

            # Get jobs collection
            collection = db.collection "clients"

            # Get all the jobs
            collection.update { _id: client._id }, { $set: servers: client.servers }, (err, client) ->
                return callback(err) if err

                # Close the database
                db.close()

                # Client was updated!
                callback null, client

    ###
    Executes all the jobs within the queue
    ###
    run: (runCallback) =>
        # Fetch all the jobs
        @getJobs (err, jobs) =>
            # Go through each element in series, callback when needed
            async.eachSeries jobs, ((job_opts, callback) =>
                job = new Job job_opts, @CONFIG

                # Executes the job, and returns a mutated client
                log.info "Now executing job #{job._id}"

                # Execute the job
                job.execute (err, client) =>
                    return callback(err) if err

                    # Job completed succesfully!
                    # Remove the job from the queue
                    log.info "Finished job #{job._id}"
                    @removeJob job, (err) =>
                        return callback(err) if err

                        # Now finally, update the client
                        @updateClient client, (err) =>
                            return callback(err) if err

                            log.info "Client #{job.client} updated for job #{job._id}"

                            # Finsihed everything! Next job!
                            callback null
            ), (err) =>
                return runCallback(err) if err

                log.info "All jobs finished without error!"

                runCallback null, jobs

module.exports = Jobs
