'use strict';

const assert = require('assert');
const base64 = require('js-base64').Base64;
const bluebird = require('bluebird');
const google = require('googleapis');
const ioredis = require('ioredis');
const _ = require('lodash');
const mailcomposer = require('mailcomposer');

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
  const credentials0 = yield redis.get('config.credentials');
  const credentials = JSON.parse(credentials0);
  const sendInterval0 = yield redis.get('config.send_interval');
  const sendInterval = parseInt(sendInterval0);
  assert(_.isSafeInteger(sendInterval));
  const checkInterval0 = yield redis.get('config.check_interval');
  const checkInterval = parseInt(checkInterval0);
  assert(_.isSafeInteger(checkInterval));
  const targetEmailAddress = yield redis.get('config.target_email_address');
  assert(!_.isEmpty(targetEmailAddress));
  const subject = yield redis.get('config.subject');
  assert(!_.isEmpty(subject));
  const template = yield redis.get('config.template');
  assert(!_.isEmpty(template));
  return {
    googleClientId,
    googleClientSecret,
    credentials,
    sendInterval,
    checkInterval,
    targetEmailAddress,
    subject,
    template,
  };
}

function makeClients(googleClientId, googleClientSecret, credentials) {
  const oauth2Client = new google.auth.OAuth2(googleClientId, googleClientSecret);
  oauth2Client.setCredentials(credentials);
  const gmail0 = google.gmail({
    version: 'v1',
    auth: oauth2Client,
  });
  const gmail = {
    messages: bluebird.promisifyAll(gmail0.users.messages),
  };
  const oauth2 = google.oauth2({
    version: 'v2',
    auth: oauth2Client,
  });
  const userinfo = bluebird.promisifyAll(oauth2.userinfo);
  return {gmail, userinfo};
}

function* getLastSent() {
  const result = yield redis.zrevrangebyscore('history', '+inf', '-inf', 'WITHSCORES', 'LIMIT', '0', '1');
  if (_.isEmpty(result)) {
    return null;
  } else {
    const [lastSentEmail, lastSentTime0] = result;
    const lastSentTime = parseInt(lastSentTime0);
    assert(!_.isEmpty(lastSentEmail));
    assert(_.isSafeInteger(lastSentTime));
    return {lastSentEmail, lastSentTime};
  }
}

function* checkShouldSend(interval) {
  const lastSent = yield* getLastSent();
  if (_.isEmpty(lastSent)) {
    return true;
  } else {
    const {lastSentTime} = lastSent;
    const timeSince = Date.now() - lastSentTime;
    return timeSince >= interval;
  }
}

function* getMyUserInfo(userinfo) {
  const myUserInfo = yield userinfo.getAsync();
  assert(_.isObject(myUserInfo));
  return _.mapKeys(myUserInfo, (v, k) => `my_${k}`);
}

function* makeEmail(myUserInfo, to, subject, template) {
  assert(!_.isEmpty(myUserInfo.my_name));
  assert(!_.isEmpty(myUserInfo.my_email));
  const from = {
    name: myUserInfo.my_name,
    address: myUserInfo.my_email
  };
  const compiled = _.template(template);
  const text = compiled(myUserInfo); // TODO augment
  const mail = mailcomposer({
    from,
    to,
    subject,
    text,
  });
  const build = bluebird.promisify(mail.build, {context: mail});
  const buffer = yield build();
  return buffer.toString('ascii');
}

function* sendEmail(gmail, email) {
  const raw = base64.encodeURI(email);
  const sendResult = yield gmail.messages.sendAsync({
    userId: 'me',
    resource: {raw}
  });
  const added = yield redis.zadd('history', Date.now(), email);
  return sendResult;
}

function* main() {
  const {
    googleClientId,
    googleClientSecret,
    credentials,
    sendInterval,
    checkInterval,
    targetEmailAddress,
    subject,
    template,
  } = yield* getConfig();
  const {gmail, userinfo} = makeClients(googleClientId, googleClientSecret, credentials);
  while (true) {
    const shouldSend = yield* checkShouldSend(sendInterval);
    if (shouldSend) {
      const myUserInfo = yield* getMyUserInfo(userinfo);
      const email = yield* makeEmail(myUserInfo, targetEmailAddress, subject, template);
      const sendResult = yield* sendEmail(gmail, email);
      console.log(JSON.stringify(sendResult, null, 2));
    }
    yield bluebird.delay(checkInterval);
  }
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
