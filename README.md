OpenStackBackup
===============

A task runner for the dashboard app OpenStackBackupManager.

## Environmental Variables

All the following are required to run. If using [foreman](https://github.com/ddollar/foreman), then place variables in a `.env` file in the application root.

* **DECRYPTION_KEY** - A long key to encrypt and decrypt password data for OpenStack, same as the OpenStackBackupManager.
* **FROM_EMAIL** - The email that is being sent from.
* **FROM_NAME** - The name on the outgoing emails.
* **MANDRILL_TOKEN** - The token for the Mandrill account.
* **MONGOHQ_URL** - The url for the MongoDB, including authentication if applicable.
* **SLACK_NOTIFICATION_URL** - The url for the slack endpoint to post (optional).
* **TO_EMAIL** - The email address to send the info to.
* **TO_NAME** - The name to address the email messages to.

## Getting Started

1. Clone the repo to your destination. Skip the next step if you have already setup the database for the OpenStackBackupManager.
2. Setup a mongodb with the following collections
    - users
    - clients
    - jobs
3. Setup the environment variables
4. Create users using the `pass_create.js` script
5. Add cron job to execute `process.js` with the `--process` parameter every 10 minutes.
6. Add cron job to execute `process.js` with the `--queue` parameter as often as you want backups to be taken.

Upon the next run of the `--queue`, the script will add the jobs to the database for backing up and for deleting old backups. When the next time that `--process` runs, it will grab the jobs and run through them. This is not currently setup for multiple processors.
