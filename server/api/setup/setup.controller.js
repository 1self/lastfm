/**
 * Using Rails-like standard naming convention for endpoints.
 * POST    /things              ->  create
 */

'use strict';

var _ = require('lodash');
var request = require('request');
var Lib1selfserver = require('lib1self-server');

// Get list of things
exports.index = function(req, res) {
  console.log(req.body.username);
    var username = req.body.username;
    if (username === undefined || username.length === 0) {
        res.status(400).json({
        	status: "username is blank"
        });

        return;
    }

    var callbackUrl = 'https://localhost:9001/api/sync?username='
    					+ username
    					+ '&lastSyncDate={{lastSyncDate}}'
    					+ '&streamId={{streamId}}';

    res.setHeader("Content-Type", "application/json")

	var config = {
		server: 'http://localhost:5000',
		appId: "app-id-8aae965172e09b182bede2d71c2b7ebe",
		appSecret: "app-secret-23e3afadea809f6697d19a8f1754e37df72522b310d57107d5ddb10bda821dd6",
		callbackUrl: callbackUrl
	}

    Lib1selfserver.createStream(config, function(error, stream){
    	var barchartUrl = stream.visualize()
    							.objectTags(["music"])
    							.actionTags(["listen"])
    							.count()
    							.barChart()
    							.url()

    	var jsonUrl = stream.visualize()
    							.objectTags(["music"])
    							.actionTags(["listen"])
    							.count()
    							.json()
    							.url()

		res.json({
	        "status": "done",
	        "barChart": barchartUrl,
	        "jsonUrl": jsonUrl
	    });

	    stream.sync(function() {});
    });
};