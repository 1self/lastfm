'use strict';
var _ = require('lodash');
var request = require('request');
var q = require("q");

var CONTEXT_URI = process.env.CONTEXT_URI;
var ONESELF_API = process.env.ONESELF_API;
var LASTFM_APP_ID = process.env.LASTFM_APP_ID;
var LASTFM_APP_SECRET = process.env.LASTFM_APP_SECRET;
var LASTFM_HOST = process.env.LASTFM_HOST;

console.log('CONTEXT_URI=' + CONTEXT_URI);
console.log('ONESELF_API=' + ONESELF_API);
console.log('LASTFM_APP_ID=' + LASTFM_APP_ID);
console.log('LASTFM_APP_SECRET=' + LASTFM_APP_SECRET);
console.log('LASTFM_HOST=' + LASTFM_HOST);

var logInfo = function(req, username, message, object){
  req.app.logger.info(username + ': ' + message, object);
}

var logDebug = function(req, username, message, object){
  req.app.logger.debug(username + ': ' + message, object);
}

var logError = function(req, username, message, object){
  req.app.logger.error(username + ': ' + message, object);
}

exports.index = function (req, res) {
  var username = req.body.username;
  var oneselfUsername = req.body.oneselfUsername;
  var registrationToken = req.body.registrationToken;
  var redirectUri = req.body.redirectUri;
  logInfo(req, oneselfUsername, 'setting up integration', username);
  logDebug(req, username, 'username, registrationToken, redirectUri: ', [username, registrationToken, redirectUri]);
  if (username === undefined || username.length === 0) {
    res.status(400).json({
      status: "username is blank"
    });
    return;
  }

  var callbackUrl = [LASTFM_HOST, 
                    '/api/sync?username=', 
                    username, 
                    '&latestSyncField={{latestSyncField}}', 
                    '&streamid={{streamid}}'].join('');

  logDebug(req, username, 'callbackUrl', [callbackUrl]);

  var createStream = function (oneselfUsername, registrationToken) {
    var streamPostUri = ONESELF_API + '/v1/users/' + oneselfUsername + '/streams'
    var authorization = LASTFM_APP_ID + ':' + LASTFM_APP_SECRET;
    logDebug(req, username, 'creating stream: streamPostUri, authorization', [streamPostUri, authorization]);
    var deferred = q.defer();
    request({
      method: 'POST',
      uri: streamPostUri,
      headers: {
        'Authorization': LASTFM_APP_ID + ':' + LASTFM_APP_SECRET,
        'registration-token': registrationToken
      },
      json: true,
      body: {
        callbackUrl: callbackUrl
      }
    }, function (e, response, body) {
      if (e) {
        deferred.reject("Error: ", e);
        return;
      }

      if(response === undefined){
        logDebug(req, username, 'no response, streamPostUri: ', streamPostUri);
        deferred.reject('no response');
        return;
      }
      if (response.statusCode === 401) {
        deferred.reject('auth error: check your appId and appSecret', null);
        return;
      }
      if (response.statusCode === 400) {
        deferred.reject('auth error: check your appId and appSecret', null);
        return;
      }
      deferred.resolve(body);
    });
    return deferred.promise;
  };

  var sync = function (stream) {
    var deferred = q.defer();
    var callbackUrlWithStream = stream.callbackUrl.replace('{{streamid}}', stream.streamid);
    logDebug(req, username, 'syncing first time: callbackUrlWithStream, writeToken', [callbackUrlWithStream, stream.writeToken]);
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
    logInfo(req, username, 'registrationToken or username blank', [registrationToken, username]);
    res.status(200).send();
  }
  else {
    createStream(oneselfUsername, registrationToken) 
      .then(function (stream) {
        sync(stream);
        logDebug(req, username, 'sending redirect: ', redirectUri)
        res.status(200).send({redirect: redirectUri + "?success=true"});
      }).catch(function (error) {
        logError(req, username, 'error in create stream promise chain: ', error);
        res.status(200).send({redirect: redirectUri + "?success=false"});
      });
  }
};
