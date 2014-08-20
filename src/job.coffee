pkgcloud = require 'pkgcloud'
parsel = require 'parsel'
log = require 'log4node'
async = require 'async'
_ = require 'underscore'
mongodb = require 'mongodb'
sleep = require 'sleep'

MongoClient = mongodb.MongoClient
ObjectID = mongodb.ObjectID

# Describes the serialization function for the server objects
serverToJSON = ->
    id: @id
    name: @name
    status: @status
    hostId: @hostId
    addresses: @addresses
    progress: @progress
    flavor: @flavorId
    image: @imageId
    created: @created
    updated: @updated

# Responsible for holding data on and excuting the given job
class Job
    constructor: (opts, CONFIG) ->
        # Extract commonly used objects
        @_id = opts._id
        @type = opts.type
        @client = opts.client

        # Get config vars
        @MONGOHQ_URL = CONFIG.MONGOHQ_URL
        @DECRYPTION_KEY = CONFIG.DECRYPTION_KEY

        @log = new log.Log4Node level: 'debug'

        # Set prefix
        @log.setPrefix("[%d] <#{@_id.toHexString()}:#{@type}> %l ")

        @opts = opts

    get_client: (callback) =>
        # Connect to the mongo db
        MongoClient.connect @MONGOHQ_URL, (err, db) =>
            return callback(err) if err

            # Get clients collection
            collection = db.collection "clients"

            # Find the client in the collection
            db.collection("clients").findOne new ObjectID(@client), (err, client) =>
                return callback(err) if err

                # Close the db
                db.close()

                # Return the client
                callback null, client

                return

    client_server_update: (client, callback) =>
        # Go get all the servers
        @compute_client.getServers (err, servers) =>
            return callback(err) if err

            # Modify some of the variables
            servers = _.map servers, (server) ->
                server.flavor = server.flavorId
                server.image = server.imageId
                return server

            # Get the current servers ids
            current_server_ids = _.pluck client.servers, 'id'

            # Go through the new list of servers, reject all that
            new_servers = _.reject servers, (server) ->
                # Already appear in the current id list
                _.some current_server_ids, (current_server_id) ->
                    current_server_id is server.id

            grouped_servers = _.groupBy servers, (server) ->
                already_in_list = _.some current_server_ids, (current_server_id) ->
                    current_server_id is server.id

                if already_in_list
                    'old'
                else
                    'new'

            # If there are servers that we already have...
            if grouped_servers.old?
                # Loop over them
                for old_server in grouped_servers.old
                    # And set the serialization function
                    old_server.toJSON = serverToJSON

                    # Followed by finding the server for the client
                    client_server = _.findWhere client.servers, id: old_server.id

                    # Of course, flatten the object
                    old_server = old_server.toJSON()

                    # And finally update the client server
                    for attrname, attrvalue of old_server
                        client_server[attrname] = attrvalue

            # If there are new servers that need to be added
            if grouped_servers.new?
                # Go over the list of new servers
                for new_server in grouped_servers.new
                    # Append the serialization function
                    new_server.toJSON = serverToJSON

                    # Create the blank backups object
                    new_server.backups = []

                    # Run it through before pushing it into the new client
                    client.servers.push new_server.toJSON()

            # Callback with modified client
            callback null, client

    get_compute_client: (client) =>
        # Decrypt the password from the model
        decryptedPassword = parsel.decrypt @DECRYPTION_KEY, client.account.password

        # Build the client options
        @clientOptions =
            provider: 'openstack'
            authUrl: client.account.authUrl
            region: client.account.region
            username: client.account.userName
            password: decryptedPassword

        # Create the client
        pkgcloud.compute.createClient @clientOptions

    action_delete_server: (client, callback) =>
        @log.info "Starting destroy of server"
        # Call the simple destroy function
        @compute_client.destroyServer @opts.server, (err, destroyedServer) =>
            return callback([@opts, err]) if err

            @log.info "Destroy complete for server #{@opts.server}"

            # Completed! Remove it from the client list
            client.servers = _.reject client.servers, (server) =>
                server.id is @opts.server

            # Return with the updated client
            callback null, client, false

    action_restore_server: (client, callback) =>
        old_server_id = @opts.server
        backup_id = @opts.image

        # Get the current server
        @compute_client.getServer old_server_id, (err, server) =>
            return callback([@opts, err]) if err

            @log.info "Got old server."

            # Get the image we are loading from
            @compute_client.getImage backup_id, (err, image) =>

                # Prepare the new server object
                new_server =
                    image: backup_id,
                    flavor: server.flavorId,
                    name: image.name

                @log.info "Got image to restore from."

                # Create server from image
                @compute_client.createServer new_server, (err, new_server) =>
                    return callback([@opts, err]) if err

                    # Serialize
                    new_server.toJSON = serverToJSON

                    # Push in the client
                    client.servers.push new_server.toJSON()

                    @log.info "New server created."

                    # Lookup ips
                    @compute_client.getFloatingIps (err, ips) =>

                        server_floating_ip = null

                        # Find the matching ips
                        for ip in ips
                            if ip.instance_id is old_server_id
                                server_floating_ip = ip
                                break

                        # If we found one
                        if server_floating_ip?
                            # Then remove it
                            @log.info "Found ip with matching instance: #{server_floating_ip}"

                            # Remove the floating ip
                            @compute_client.removeFloatingIp old_server_id, server_floating_ip, (err) =>
                                return callback([@opts, err]) if err

                                @log.info "Removed ip from old instance."

                                finished_adding_ip = false;

                                # Add floating ip, ensure that there isn't any lag errors
                                async.doUntil ((doUntilCallback) =>
                                    @compute_client.addFloatingIp new_server, server_floating_ip, (err) =>
                                        if err
                                            @log.error "Failed adding ip, retrying in 20 seconds..."

                                            # Sleep for 20 seconds
                                            sleep.sleep 20

                                            @log.info "Retrying..."
                                        else
                                            # Success
                                            @log.info "Added ip to new instance."
                                            finished_adding_ip = true

                                        # Check now
                                        doUntilCallback()
                                ), ( ->
                                    return finished_adding_ip
                                ), (err) =>
                                    return callback([@opts, err]) if err

                                    # Finsihed, pass the updated client
                                    callback null, client

                        else
                            @log.error "No matching ip with the right instance id."

                            callback null, client

    action_wrap_run: (client, callback) =>
        # Call the action
        @["action_#{@type}"] client, (err, client, run_update=true) =>
            return callback(err) if err

            if run_update
                # Update the client record
                @client_server_update client, callback
            else
                callback null, client

    action_create_image: (client, callback) =>
        @log.info "Starting snapshot for server #{@opts.server}"
        @compute_client.createImage
            name: @opts.name
            server: @opts.server
        , (err, image) =>
            return callback([@opts, err]) if err

            @log.info "Finished snapshot for server #{@opts.server}"

            # Find the server we just backed up
            server = _.findWhere client.servers, id: @opts.server

            # Remove it from the list
            other_servers = _.reject client.servers, (server) =>
                server.id is @opts.server

            # If the server backups is empty
            if !server.backups?
                server.backups = []

            # Update the server entry
            server.backups.push
                id: image.id
                name: image.name
                created: image.created

            # Add it to the list again, now with the updated server
            other_servers.push server

            # Update the client object with the changed servers entry
            client.servers = other_servers

            # Callback with the new client to be updated
            callback null, client

    action_delete_image: (client, callback) =>
        @log.info "Started deletion of image #{@opts.image}"
        # Call destroy on the image
        @compute_client.destroyImage @opts.image, (err) =>
            # We want to complain on errors, except 404,
            # which indicates that the image does not exist!
            # In this instance, we still want to clean the db.
            if err and err.statusCode is not 404
                return callback([@opts, err])

            @log.info "Finished deletion of image #{@opts.image} for server #{@opts.server}"

            # Find the server we just deleted an image for
            server = null

            # Loop through
            for srv in client.servers
                if srv.id is @opts.server
                    server = srv
                    break

            # Remove it from the list
            other_servers = _.reject client.servers, (server) =>
                server.id is @opts.server

            # Remove the backup we just deleted
            server.backups = _.reject server.backups, (backup) =>
                backup.id is @opts.image

            # Add the mutated server
            other_servers.push server

            # Update the client object with the changed servers entry
            client.servers = other_servers

            # Callback with the new client to be updated
            callback null, client

    execute: (callback) =>
        @get_client (err, client) =>
            return callback([@opts, err]) if err

            # Populate the compute client
            @compute_client = @get_compute_client client

            # Run the action
            @action_wrap_run client, callback

            return

module.exports = Job
