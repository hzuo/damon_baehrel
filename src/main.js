'use strict';

const assert = require('assert');
const bluebird = require('bluebird');
const google = require('googleapis');
const ioredis = require('ioredis');
const _ = require('lodash');

const env = {
  redisHost: process.env.MY_REDIS_HOST || 'localhost',
  redisPort: process.env.MY_REDIS_PORT || 6379,
  googleClientId: process.env.MY_GOOGLE_CLIENT_ID || assert(false, 'MY_GOOGLE_CLIENT_ID'),
  googleClientSecret: process.env.MY_GOOGLE_CLIENT_SECRET || assert(false, 'MY_GOOGLE_CLIENT_SECRET'),
};

const redis = new ioredis(env.redisPort, env.redisHost);
