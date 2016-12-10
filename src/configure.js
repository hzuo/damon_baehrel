'use strict';

const assert = require('assert');
const bluebird = require('bluebird');
const fs = require('fs');
const google = require('googleapis');
const ioredis = require('ioredis');
const _ = require('lodash');
const readline = require('readline');

const env = {
  redisHost: process.env.MY_REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.MY_REDIS_PORT) || 6379,
};
assert(_.isSafeInteger(env.redisPort));

const redis = new ioredis(env.redisPort, env.redisHost);

// jscs:disable
const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
// jscs:enable

function* main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const question = bluebird.promisify((question, callback) => {
    rl.question(question, (answer) => {
      callback(null, answer);
    });
  });

  const readFile = bluebird.promisify(fs.readFile);

  const googleClientId = yield question('google client id: ');
  assert(!_.isEmpty(googleClientId));

  const googleClientSecret = yield question('google client secret: ');
  assert(!_.isEmpty(googleClientSecret));

  const oauth2Client = bluebird.promisifyAll(new google.auth.OAuth2(googleClientId, googleClientSecret, "http://127.0.0.1:1337"));
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.compose']
  });
  console.log(`authorize this app by visiting this url: ${authUrl}`);
  const code = yield question('enter the code from that page here: ');
  const credentials = yield oauth2Client.getTokenAsync(code);
  assert(_.isObject(credentials));

  const sendInterval0 = yield question('send interval (ms): ');
  const sendInterval = parseInt(sendInterval0);
  assert(_.isSafeInteger(sendInterval));

  const checkInterval0 = yield question('check interval (ms): ');
  const checkInterval = parseInt(checkInterval0);
  assert(_.isSafeInteger(checkInterval));

  const targetEmailAddress = yield question('target email address: ');
  assert(emailRegex.test(targetEmailAddress));

  const subject = yield question('subject: ');
  assert(!_.isEmpty(subject));

  const templateFile = yield question('template file: ');
  assert(!_.isEmpty(templateFile));
  const template = yield readFile(templateFile, 'utf8');
  assert(!_.isEmpty(template));

  yield redis.mset({
    'config.google_client_id': googleClientId,
    'config.google_client_secret': googleClientSecret,
    'config.credentials': JSON.stringify(credentials),
    'config.send_interval': sendInterval,
    'config.check_interval': checkInterval,
    'config.target_email_address': targetEmailAddress,
    'config.subject': subject,
    'config.template': template,
  });

  console.log('configured.');
  rl.close();
  return 0;
}

(() => {
  const mainFunction = bluebird.coroutine(main);
  mainFunction().then((status) => {
    redis.quit();
    if (_.isSafeInteger(status)) {
      process.exit(status);
    }
  });
})();
