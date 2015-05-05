'use strict';
var _ = require('lodash');
var request = require('request');
var q = require("q");
var ONESELF_HOST = process.env.ONESELF_HOST;
var INTEGRATION_HOST = process.env.INTEGRATION_HOST;
var APP_ID = process.env.APP_ID;
var APP_SECRET = process.env.APP_SECRET;
var CONTEXT_URI = process.env.CONTEXT_URI;

exports.index = function (req, res) {
  var username = req.body.username;
  var oneselfUsername = req.body.oneselfUsername;
  var registrationToken = req.body.registrationToken;
  if (username === undefined || username.length === 0) {
    res.status(400).json({
      status: "username is blank"
    });
    return;
  }

  var callbackUrl = INTEGRATION_HOST + '/api/sync?username='
    + username
    + '&latestSyncField={{latestSyncField}}'
    + '&streamid={{streamid}}';

  var createStream = function (oneselfUsername, registrationToken) {
    console.log("Creating stream ... ");
    var deferred = q.defer();
    request({
      method: 'POST',
      uri: CONTEXT_URI + '/v1/users/' + oneselfUsername + '/streams',
      headers: {
        'Authorization': APP_ID + ':' + APP_SECRET,
        'registration-token': registrationToken
      },
      json: true,
      body: {
        callbackUrl: callbackUrl
      }
    }, function (e, response, body) {
      if (response.statusCode === 401) {
        deferred.reject('auth error: check your appId and appSecret', null);
        return;
      }
      if (response.statusCode === 400) {
        deferred.reject('auth error: check your appId and appSecret', null);
        return;
      }
      if (e) {
        deferred.reject("Error: ", e);
      }
      deferred.resolve(body);
    });
    return deferred.promise;
  };
  var sync = function (stream) {
    console.log("Syncing...");
    var deferred = q.defer();
    var callbackUrlWithStream = stream.callbackUrl.replace('{{streamid}}', stream.streamid);
    request({
      method: 'POST', uri: callbackUrlWithStream, gzip: true, headers: {
        'Authorization': stream.writeToken
      }
    }, function (e, response, body) {
      if (e) {
        deferred.reject(e);
        return;
      }
      if (response.statusCode !== 200) {
        deferred.reject(response);
        return;
      }
      deferred.resolve(body);
    });
    return deferred.promise;
  };
  if (registrationToken === undefined || username === undefined) {
    res.status(200).send();
  }
  else {
    createStream(oneselfUsername, registrationToken)
      .then(function (stream) {
        sync(stream);
        res.status(200).send();
      }).catch(function (error) {
        res.status(200).send();
      });
  }
};
