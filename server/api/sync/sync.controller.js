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
var stream = {};
// Get list of things
exports.index = function(req, res) {
    console.log(req.query);

    config.username = req.query.username;
    config.lastSyncDate = req.query.lastSyncDate;
    config.streamId = req.query.streamid;
    config.writeToken = req.headers.authorization;
    config.server= 'http://localhost:5000';

    res.setHeader("Content-Type", "application/json")
    stream = lib1self.loadStream(config, config.streamId, config.writeToken, config.readToken);
    var eventStart = {
        objectTags: [ '1self', 'integration', 'lastfm']
        , actionTags: [ 'sync', 'start' ]
        , properties: {
            lastSyncDate: config.lastSyncDate
        }
    }
    console.log('stream is: ' + stream);
    stream.send(eventStart, function(error, response){
        if(error !== undefined){
            console.log('error:' + error);
        }

        console.log(response);
        console.log();
        getRecentTracks(1, res);
    })
};

function getRecentTracks(pageNum, res) {
    var url = "http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&api_key=0900562e22abd0500f0432147482cfc1&format=json&limit=200";
    url += "&page=" + pageNum;
    url += "&user=" + config.username;

    if (config.lastSyncDate !== undefined){

        var unixTimeStamp = Date.parse(config.lastSyncDate) / 1000;
        console.log(unixTimeStamp);
        url += "&from=" + unixTimeStamp;
    }

    console.log(url);

    request({
        method: 'GET',
        uri: url,
        gzip: true
    }, function(error, response, body) {
        // body is the decompressed response body
        console.log('server encoded the data as: ' + (response.headers['content-encoding'] || 'identity'));
        onGotArtistTrackData(JSON.parse(body));
        res.send(200);
    }).on('data', function(data) {
        // decompressed data as it is received
        console.log('decoded chunk: ');
    })
        .on('response', function(response) {
            // unmodified http.IncomingMessage object
            response.on('data', function(data) {
                // compressed data as it is received
                console.log('received ' + data.length + ' bytes of compressed data')
            })
        })
}

function onGotArtistTrackData(data) {
    if (data.recenttracks && data.recenttracks.track) {
        // console.log('artist tracks here');
        // console.log(data);

        if (data.recenttracks.track.length) {
            for (var i = 0; i < data.recenttracks.track.length; i++) {
                writeTrack(data.recenttracks.track[i]);
            }
        } else {
            writeTrack(data.recenttracks.track);
        }
    }

    if (data.recenttracks && data.recenttracks["@attr"]) {
        if (data.recenttracks["@attr"].totalPages > data.recenttracks["@attr"].page) {
            var nextPage = data.recenttracks["@attr"].page;
            nextPage++;
            getRecentTracks(data.recenttracks["@attr"].user, nextPage);
        }
    }
}

function writeTrack(track) {
    console.log("Got a track");
    //console.log(track);

    if (track.date) {

        var dt = new Date();

        dt.setTime(track.date.uts * 1000);

        var url = "http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=0900562e22abd0500f0432147482cfc1&format=json";

        if (track.mbid && track.mbid !== "") {
            url += "&mbid=" + track.mbid;
        } else {
            url += "&artist=" + track.artist['#text'];
            url += "&track=" + track.name;
            // console.log(track);
        }

        request({
            method: 'GET',
            uri: url,
            gzip: true
        }, function(error, response, body) {
            console.log("onGotTrackData called");
            console.log(body);
            if(body === undefined){
                console.log("error reading track");
            }
            onGotTrackData(JSON.parse(body), track);
        }).on('data', function(data) {
            // decompressed data as it is received
            console.log('decoded chunk: ');
        })
            .on('response', function(response) {
                // unmodified http.IncomingMessage object
                response.on('data', function(data) {
                    // compressed data as it is received
                    console.log('received ' + data.length + ' bytes of compressed track data')
                })
            })

    } else {
        console.log("no date");
    }
}

var sendMusicTo1self = function(trackName, trackmbid, trackDuration, trackUrl, artistName, albumName, listenDate, source) {
    var dt = new Date();
    dt.setTime(listenDate * 1000);
    var musicEvent = {
       "dateTime": dt.toISOString(),
       "objectTags": ["music"],
       "actionTags": ["listen"],
       "properties": {
           "track-duration" : trackDuration,
           "track-name": trackName,
           "track-mbid" : trackmbid,
           "track-url" : trackUrl,
           "artist-name" : artistName,
           "album-name" : albumName,
           "source" : source
       }
   };

    console.log(config.stream);
    console.log(musicEvent);
    stream.send(musicEvent, function() {});
};

function onGotTrackData(data, passedThroughTrack) {
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

        sendMusicTo1self(track.name, track.mbid, track.duration, track.url, artistName, albumTitle, listenDate, "last.fm");

        //console.log(JSON.stringify(track));
    } else {
        console.log(data);
        console.log(passedThroughTrack);
        failedTrackCount++;
    }
}

