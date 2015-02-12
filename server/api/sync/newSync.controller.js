'use strict';
var _ = require('lodash');
var request = require('request');
var lib1self = require('lib1self-server');
var q = require('q');

var config = {};
config.server = 'http://localhost:5000';

exports.index = function (req, res) {
    var username = req.query.username;
    var lastSyncDate = req.query.latestEventSyncDate;
    var streamId = req.query.streamid;
    var writeToken = req.headers.authorization;
    var createPagesToFetch = function (totalPages) {
        return _.range(totalPages, 0, -1);
    };
    var fetchRecentTracks = function (pagesToBeFetched) {
        var fetchRecentTracksPerPage = function (chain, recentTracksPromise) {
            return chain
                .then(function () {
                    return recentTracksPromise;
                })
                .then(function (recentTracks) {
                    return recentTracks.reverse().map(function (recentTrack) {
                        return {
                            mbid: recentTrack.mbid,
                            artistName: recentTrack.artist['#text'],
                            name: recentTrack.name,
                            trackUrl: recentTrack.url,
                            albumName: recentTrack.album['#text'],
                            date: recentTrack.date
                        };
                    });
                })
                .then(fetchAdditionalTrackInfo)
                .then(create1SelfEvents)
                .then(sendEventsTo1self)
                .then(function (body) {
                    console.log("Events sent to 1self successfully!")
                }, function (error) {
                    console.log("Error: ", error);
                });
        };
        return pagesToBeFetched
            .map(function (page) {
                return getRecentTracksForUser(username, page);
            })
            .reduce(fetchRecentTracksPerPage, q.resolve())
    };
    var fetchAdditionalTrackInfo = function (recentTracksInfo) {
        var getAdditionalTrackInfoFor = function (recentTrack) {
            var deferred = q.defer();
            getTrackDuration(recentTrack).then(function (trackDuration) {
                recentTrack.trackDuration = trackDuration;
                deferred.resolve(recentTrack);
            });
            return deferred.promise;
        };
        return recentTracksInfo
            .map(getAdditionalTrackInfoFor)
            .reduce(function (chain, recentTrackPromise) {
                return chain
                    .then(function () {
                        return recentTrackPromise;
                    })
                    .then(function (recentTrack) {
                        return recentTrack;
                    })
            }, q.resolve())
            .then(function () {
                return recentTracksInfo;
            })
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
                    "track-duration": recentTrackInfo.trackDuration,
                    "track-name": recentTrackInfo.name,
                    "track-mbid": recentTrackInfo.mbid,
                    "track-url": recentTrackInfo.trackUrl,
                    "artist-name": recentTrackInfo.artistName,
                    "album-name": recentTrackInfo.albumName,
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
    numberOfPagesToFetch(username)
        .then(createPagesToFetch)
        .then(fetchRecentTracks)

};

var numberOfPagesToFetch = function (username) {
    var deferred = q.defer();
    var limit = 200;
    var url = "http://ws.audioscrobbler.com/2.0/?method=user.getInfo&api_key=0900562e22abd0500f0432147482cfc1&format=json&limit=" + limit;
    url += "&user=" + username;
    request({
        method: 'GET',
        uri: url,
        gzip: true
    }, function (error, response, body) {
        if (error) {
            deferred.reject(error);
        }
        var userInfo = JSON.parse(body);
        var totalPlayCount = userInfo.user.playcount;
        var totalPages = Math.ceil(totalPlayCount / limit);
        deferred.resolve(totalPages);
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
        deferred.resolve(recentTrackData.recenttracks.track);
    });
    return deferred.promise;
};

var getTrackDuration = function (track) {
    var deferred = q.defer();
    var url = "http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=0900562e22abd0500f0432147482cfc1&format=json";
    if (track.mbid && track.mbid !== "") {
        url += "&mbid=" + track.mbid;
    } else {
        url += "&artist=" + track.artistName;
        url += "&track=" + track.name;
    }
    request({
        method: 'GET',
        uri: url,
        gzip: true
    }, function (error, response, body) {
        if (error) {
            deferred.reject(error);
        }
        if (body !== undefined) {
            var trackInfo = JSON.parse(body);
            if (trackInfo.track && trackInfo.track.duration)
                deferred.resolve(trackInfo.track.duration);
            else
                deferred.resolve("0");
        }
    });
    return deferred.promise;
};

