'use strict';

const assert = require('assert');
const bluebird = require('bluebird');
const google = require('googleapis');
const ioredis = require('ioredis');
const _ = require('lodash');

const env = {
  redisHost: process.env.MY_REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.MY_REDIS_PORT) || 6379,
};
assert(_.isSafeInteger(env.redisPort));

const redis = new ioredis(env.redisPort, env.redisHost);

function* getConfig() {
  const googleClientId = yield redis.get('config.google_client_id');
  assert(!_.isEmpty(googleClientId));
  const googleClientSecret = yield redis.get('config.google_client_secret');
  assert(!_.isEmpty(googleClientSecret));
  const refreshToken = yield redis.get('config.refresh_token');
  assert(!_.isEmpty(refreshToken));
  const sendInterval0 = yield redis.get('config.send_interval');
  const sendInterval = parseInt(sendInterval0);
  assert(_.isSafeInteger(sendInterval));
  const checkInterval0 = yield redis.get('config.check_interval');
  const checkInterval = parseInt(checkInterval0);
  assert(_.isSafeInteger(checkInterval));
  const targetEmailAddress = yield redis.get('config.target_email_address');
  assert(!_.isEmpty(targetEmailAddress));
  const template = yield redis.get('config.template');
  return {
    googleClientId,
    googleClientSecret,
    refreshToken,
    sendInterval,
    checkInterval,
    targetEmailAddress,
    template
  };
}

function makeGmail(googleClientId, googleClientSecret, refreshToken) {
  const oauth2Client = new google.auth.OAuth2(googleClientId, googleClientSecret);
  oauth2Client.setCredentials({
    refresh_token: refreshToken
  });
  const gmail0 = google.gmail({
    version: 'v1',
    auth: oauth2Client
  });
  const gmail = {
    auth: oauth2Client,
    messages: bluebird.promisifyAll(gmail0.users.messages),
  };
  return gmail;
}

function* checkShouldSend(interval) {
  const result = yield redis.zrevrangebyscore('history', '+inf', '-inf', 'WITHSCORES', 'LIMIT', '0', '1');
  if (_.isEmpty(result)) {
    return true;
  }
  const [lastEmail, lastSent0] = result;
  const lastSent = parseInt(lastSent0);
  assert(_.isSafeInteger(lastSent));
  const timeSince = Date.now() - lastSent;
  return timeSince >= interval;
}

function makeEmail() {

}

function* sendEmail(gmail, email) {
  const raw = new Buffer(email).toString('base64');
  const sendResult = yield gmail.send({
    userId: 'me',
    resource: {raw}
  });
  return sendResult;
}

function* main() {
  const {
    googleClientId,
    googleClientSecret,
    refreshToken,
    sendInterval,
    checkInterval,
    targetEmailAddress,
    template
  } = yield* getConfig();
  const gmail = makeGmail(googleClientId, googleClientSecret, refreshToken);
  while (true) {
    const shouldSend = yield* checkShouldSend(sendInterval);
    if (shouldSend) {

    }
    yield Promise.delay(checkInterval);
  }
}

(() => {
  const mainFunction = bluebird.coroutine(main);
  mainFunction().then((status) => {
    console.log(`main exited with status: ${status}`);
  });
})();
