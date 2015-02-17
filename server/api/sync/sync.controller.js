'use strict';
var _ = require('lodash');
var limit = require("simple-rate-limiter");
var request = limit(require("request")).to(5).per(1000);
var lib1self = require('lib1self-server');
var q = require('q');

var config = {};
//config.server = 'http://localhost:5000';
config.server = 'https://api-staging.1self.co';

exports.index = function (req, res) {
    var username = req.query.username;
    var lastSyncDate = req.query.latestEventSyncDate;
    var streamId = req.query.streamid;
    var writeToken = req.headers.authorization;
    var createPagesToFetch = function (totalPages) {
        return _.range(1, totalPages + 1);
    };
    var create1SelfEvents = function (recentTracksInfo) {
        return recentTracksInfo.map(function (recentTrackInfo) {
            var dt = new Date();
            var listenDate = recentTrackInfo.date.uts;
            dt.setTime(listenDate * 1000);
            return {
                "dateTime": dt.toISOString(),
                "objectTags": ["music"],
                "actionTags": ["listen"],
                "properties": {
                    "track-name": recentTrackInfo.name,
                    "track-mbid": recentTrackInfo.mbid,
                    "track-url": recentTrackInfo.url,
                    "artist-name": recentTrackInfo.artist["#text"],
                    "album-name": recentTrackInfo.album["#text"],
                    "source": "last.fm"
                }
            };
        });
    };
    var sendEventsTo1self = function (events) {
        var deferred = q.defer();
        request({
            method: 'POST',
            uri: config.server + '/v1/streams/' + streamId + '/events/batch',
            gzip: true,
            headers: {
                'Authorization': writeToken,
                'Content-type': 'application/json'
            },
            json: true,
            body: events
        }, function (err, response, body) {
            if (err) {
                deferred.reject(err);
            }
            if (response.statusCode === 404) {
                deferred.reject("Stream Not Found!")
            }
            deferred.resolve(body);
        });
        return deferred.promise;
    };
    var fetchRecentTracks = function (pagesToBeFetched) {
        console.log("Pages To be fetched: ", pagesToBeFetched);
        return pagesToBeFetched
            .reduce(function (chain, page) {
                return chain
                    .then(function () {
                        return getRecentTracksForUser(username, page)
                    })
                    .then(create1SelfEvents)
                    .then(sendEventsTo1self)
                    .then(function (body) {
                        console.log("Events sent to 1self successfully! For page: ", page);
                    }, function (error) {
                        console.log("Error: ", error);
                    });
            }, q.resolve());

    };
    numberOfPagesToFetch(username, lastSyncDate)
        .then(createPagesToFetch)
        .then(fetchRecentTracks)
        .then(function () {
            res.send(200);
        })
};

var numberOfPagesToFetch = function (username, lastSyncDate) {
    var deferred = q.defer();
    var limit = 200;
    var url = "http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&api_key=0900562e22abd0500f0432147482cfc1&format=json&limit=200";
    url += "&user=" + username;
    if (lastSyncDate !== undefined) {
        var unixTimeStamp = Date.parse(lastSyncDate) / 1000;
        url += "&from=" + unixTimeStamp;
    }
    request({
        method: 'GET',
        uri: url,
        gzip: true
    }, function (error, response, body) {
        if (error) {
            deferred.reject(error);
        }
        var data = JSON.parse(body);
        var totalPages = data.recenttracks["@attr"].totalPages;
        deferred.resolve(parseInt(totalPages));
    });
    return deferred.promise;
};

var getRecentTracksForUser = function (username, pageNum) {
    var deferred = q.defer();
    var url = "http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&api_key=0900562e22abd0500f0432147482cfc1&format=json&limit=200";
    url += "&page=" + pageNum;
    url += "&user=" + username;

    request({
        method: 'GET',
        uri: url,
        gzip: true
    }, function (error, response, body) {
        var recentTrackData = JSON.parse(body);
        if (recentTrackData.error) {
            console.log("Couldn't fetch the events");
            console.log("Url: ", url);
            deferred.reject(recentTrackData.error);
        }
        else {
            deferred.resolve(recentTrackData.recenttracks.track);
        }
    });
    return deferred.promise;
};