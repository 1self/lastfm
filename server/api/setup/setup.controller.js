/**
 * Using Rails-like standard naming convention for endpoints.
 * POST    /things              ->  create
 */

'use strict';

var _ = require('lodash');
var request = require('request');

// Get list of things
exports.index = function(req, res) {
  console.log(req.body.username);
    var username = req.body.username;
    var callbackUrl = 'https://localhost:9001/api/sync?username='
    					+ username
    					+ '&lastSyncDate={{lastSyncDate}}'
    					+ '&streamId={{streamId}}';

    res.setHeader("Content-Type", "application/json")

    if (username === undefined || username.length == 0) {
        res.status(400).json({
        	status: "username is blank"
        });

        return;
    }

    var body = {
        	callbackUrl: callbackUrl
        };

    console.log("about to request");
    request({
        method: 'POST',
        uri: "http://localhost:5000/v1/streams",
        gzip: true,
        headers: {
            "Authorization": "app-id-8aae965172e09b182bede2d71c2b7ebe:app-secret-23e3afadea809f6697d19a8f1754e37df72522b310d57107d5ddb10bda821dd6"
        },
        json: true,
        body: body
    }, function(error, response, body) {
        // body is the decompressed response body
        console.log("response");
        console.log(error);
        console.log(response.status);
        console.log(body);
        res.json({
	        "status": "done",
	        "stream": body
	    });
    });
};