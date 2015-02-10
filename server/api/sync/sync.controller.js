/**
 * Using Rails-like standard naming convention for endpoints.
 * GET     /things              ->  index
 * POST    /things              ->  create
 * GET     /things/:id          ->  show
 * PUT     /things/:id          ->  update
 * DELETE  /things/:id          ->  destroy
 */

'use strict';

var _ = require('lodash');
var request = require('request');
var lib1self = require('lib1self-server');

var failedTrackCount = 0;

var config = {};
config.server= 'http://api-staging.1self.co';
// Get list of things
exports.index = function (req, res) {
    var username = req.query.username;
    var lastSyncDate = req.query.lastSyncDate;
    var streamId = req.query.streamid;
    var writeToken = req.headers.authorization;
    var callbackUrl = 'http://localhost:9001/api/sync?username=' + username
        + '&lastSyncDate' + lastSyncDate
        + '&streamid' + streamId;

    res.setHeader("Content-Type", "application/json");
    var stream = lib1self.loadStream(config, streamId, writeToken, null, callbackUrl, lastSyncDate);
    var eventStart = {
        objectTags: [ '1self', 'integration', 'lastfm'], actionTags: [ 'sync', 'start' ], properties: {
            lastSyncDate: config.lastSyncDate
        }
    };
    stream.send(eventStart, function (error, response) {
        if (error !== undefined) {
            console.log('error:' + error);
        }
        getRecentTracks(username, 1, res, stream, lastSyncDate);
    })
};

function getRecentTracks(username, pageNum, res, stream, lastSyncDate) {
    var url = "http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&api_key=0900562e22abd0500f0432147482cfc1&format=json&limit=200";
    url += "&page=" + pageNum;
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
        onGotArtistTrackData(JSON.parse(body), stream, res, lastSyncDate);
        if (!res.finished) {
            res.send(200);
        }
    })
}

function onGotArtistTrackData(data, stream, res, lastSyncDate) {
    if (data.recenttracks && data.recenttracks.track) {
        if (data.recenttracks.track.length) {
            for (var i = 0; i < data.recenttracks.track.length; i++) {
                writeTrack(data.recenttracks.track[i], stream);
            }
        } else {
            writeTrack(data.recenttracks.track, stream);
        }
    }
    if (data.recenttracks && data.recenttracks["@attr"]) {
        if (data.recenttracks["@attr"].totalPages > data.recenttracks["@attr"].page) {
            var nextPage = data.recenttracks["@attr"].page;
            nextPage++;
            getRecentTracks(data.recenttracks["@attr"].user, nextPage, res, stream, lastSyncDate);
        }
    }
}

function writeTrack(track, stream) {
    if (track.date) {
        var dt = new Date();
        dt.setTime(track.date.uts * 1000);
        var url = "http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=0900562e22abd0500f0432147482cfc1&format=json";
        if (track.mbid && track.mbid !== "") {
            url += "&mbid=" + track.mbid;
        } else {
            url += "&artist=" + track.artist['#text'];
            url += "&track=" + track.name;
        }
        request({
            method: 'GET',
            uri: url,
            gzip: true
        }, function (error, response, body) {
            if (body !== undefined) {
                onGotTrackData(JSON.parse(body), track, stream);
            }
        })
    }
}

var sendMusicTo1self = function (trackName, trackmbid, trackDuration, trackUrl, artistName, albumName, listenDate, source, stream) {
    var dt = new Date();
    dt.setTime(listenDate * 1000);
    var musicEvent = {
        "dateTime": dt.toISOString(),
        "objectTags": ["music"],
        "actionTags": ["listen"],
        "properties": {
            "track-duration": trackDuration,
            "track-name": trackName,
            "track-mbid": trackmbid,
            "track-url": trackUrl,
            "artist-name": artistName,
            "album-name": albumName,
            "source": source
        }
    };
    stream.send(musicEvent, function (error, response) {
    });
};

function onGotTrackData(data, passedThroughTrack, stream) {
    var html = '';
    var track = data.track;
    var listenDate = passedThroughTrack.date.uts;
    if (track) {
        var dt = new Date();
        dt.setTime(listenDate * 1000);
        var artistName = "unknown";
        var albumTitle = "unknown";
        if (track.artist) {
            artistName = track.artist.name;
        }
        if (track.album) {
            albumTitle = track.album.title;
        }
        sendMusicTo1self(track.name, track.mbid, track.duration, track.url, artistName, albumTitle, listenDate, "last.fm", stream);
    } else {
        failedTrackCount++;
    }
}

