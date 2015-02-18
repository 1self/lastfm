'use strict';
var _ = require('lodash');
var request = require('request');
var q = require("q");

exports.index = function (req, res) {
    var username = req.body.username;
    var token = req.body.token;
    console.log("token from 1self is  : " + token);
    if (username === undefined || username.length === 0) {
        res.status(400).json({
            status: "username is blank"
        });
        return;
    }

    var callbackUrl = 'http://localhost:9001/api/sync?username='
        + username
        + '&latestEventSyncDate={{latestEventSyncDate}}'
        + '&streamid={{streamid}}';

    /*	var config = {
     server: 'https://api-staging.1self.co',
     appId: "app-id-8aae965172e09b182bede2d71c2b7ebe",
     appSecret: "app-secret-23e3afadea809f6697d19a8f1754e37df72522b310d57107d5ddb10bda821dd6",
     callbackUrl: callbackUrl
     };
     */

    var config = {
        server: 'http://localhost:5000',
        appId: "abc",
        appSecret: "123",
        callbackUrl: callbackUrl
    };

    var createStream = function () {
        console.log("Creating stream ... ");
        var deferred = q.defer();
        request({
            method: 'POST',
            uri: config.server + '/v1/streams',
            headers: {
                'Authorization': config.appId + ':' + config.appSecret
            },
            json: true,
            body: {
                callbackUrl: config.callbackUrl
            }
        }, function (e, response, body) {
            if (response.statusCode === 401) {
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
        var callbackUrl = config.callbackUrl.replace('{{streamid}}', stream.streamid);

        console.log("Callback URL after sync: ", config.callbackUrl);
        request({
            method: 'POST', uri: callbackUrl, gzip: true, headers: {
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

    createStream()
        .then(function (stream) {
            console.log("Stream: ", stream);
            sync(stream);
            res.status(200).json({"redirectUrl": "http://localhost:5000/dashboard?streamId="
                + stream.streamid + "&readToken=" + stream.readToken});
        });
};