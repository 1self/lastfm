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
var failedTrackCount = 0;

// Get list of things
exports.index = function(req, res) {
    console.log(req.query);
    var username = req.query.username;
    var lastSyncData = req.query.lastSyncDate;
    var streamId = req.query.streamId;

    res.setHeader("Content-Type", "application/json")

    if (streamId !== undefined) {
        if (username.length > 0) {
            getRecentTracks(username, 1, null);

        } else {
            console.log("username blank");
        }
    } else {
        request({
            method: 'POST',
            uri: "https://sandbox.1self.co/v1/streams",
            gzip: true,
            headers: {
                "Authorization": "app-id-8aae965172e09b182bede2d71c2b7ebe:app-secret-23e3afadea809f6697d19a8f1754e37df72522b310d57107d5ddb10bda821dd6"
            }
        }, function(error, response, body) {
            // body is the decompressed response body
            console.log(body);
        })
        .on('response', function(response) {
            // unmodified http.IncomingMessage object
            response.on('data', function(data) {
                // compressed data as it is received
                console.log('received ' + data.length + ' bytes of compressed data')
            })
        });

        if (username.length > 0) {
            getRecentTracks(username, 1, null);

        } else {
            console.log("username blank");
        }
    }


    res.json({
        "status": "done",
        "streamid": streamId
    });
};

function getRecentTracks(username, pageNum, lastSyncDate) {

    var url = "http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&api_key=0900562e22abd0500f0432147482cfc1&format=json&limit=200";
    url += "&page=" + pageNum;
    url += "&user=" + username;


    if (lastSyncDate)
        url += "&from=" + lastSyncDate;

    console.log(url);

    request({
        method: 'GET',
        uri: url,
        gzip: true
    }, function(error, response, body) {
        // body is the decompressed response body
        console.log('server encoded the data as: ' + (response.headers['content-encoding'] || 'identity'));
        onGotArtistTrackData(JSON.parse(body));
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
    console.log(trackName + "Sent to 1self in stream ");
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

