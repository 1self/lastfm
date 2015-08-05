'use strict';
var _ = require('lodash');
var request = require("request");
var q = require('q');
var ONESELF_API = process.env.ONESELF_API;

var logInfo = function(req, username, message, object){
  req.app.logger.info(username + ': ' + message, object);
}

var logDebug = function(req, username, message, object){
  req.app.logger.debug(username + ': ' + message, object);
}

var logSilly = function(req, username, message, object){
  req.app.logger.silly(username + ': ' + message, object);
}

var logError = function(req, username, message, object){
  req.app.logger.error(username + ': ' + message, object);
}

var logWarning = function(req, username, message, object){
  //req.app.logger.warning(username + ': ' + message, object);
}

exports.index = function (req, res) {

  var username = req.query.username;
  var lastSyncField = req.query.latestSyncField;
  var streamId = req.query.streamid;
  var writeToken = req.headers.authorization;

  logInfo(req, username, 'starting sync: lastSyncDate, streamId, writeToken', [lastSyncField, streamId, writeToken]);
  var createPagesToFetch = function (totalPages) {
    if(totalPages === undefined){
      logWarning(req, username, 'total pages is undefined');
      throw [];
    }

    var result = _.range(1, totalPages + 1);
    logDebug(req, username, 'total pages is ', totalPages);
    logDebug(req, username, 'pages to fetch is ', result);

    if(result === []){
      throw result;
    }

    return result;
  };

  var create1SelfEvents = function (recentTracksInfo) {
    return recentTracksInfo.map(function (recentTrackInfo) {
      var dt = new Date();

      // you don't get a date for tracks that are currently playing. We'll
      // get this data when the current listen of the track is over
      if(recentTrackInfo["@attr"] && recentTrackInfo["@attr"].nowplaying){
        return null;
      }

      var listenDate = recentTrackInfo.date.uts;
      dt.setTime(listenDate * 1000);
      return {
        "dateTime": dt.toISOString(),
        "objectTags": ["music"],  
        "actionTags": ["listen"],
        "id": recentTrackInfo.mbid,
        "url": recentTrackInfo.url,
        "properties": {
          "track-name": recentTrackInfo.name,
          "artist-name": recentTrackInfo.artist["#text"],
          "album-name": recentTrackInfo.album["#text"],
        },
        "source": "last.fm",
        "latestSyncField": {
          "$date": dt.toISOString()
        }
      };
    });
  };

  var sendEventsTo1self = function (events) {
    var deferred = q.defer();

    var batchApiUri = ONESELF_API + '/v1/streams/' + streamId + '/events/batch';
    logDebug(req, username, 'sending events to batchapi, batchApiUri, writeToken', [batchApiUri, writeToken]);
    logSilly(req, username, 'batch events', events);
    request({
      method: 'POST',
      uri: batchApiUri,
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

  var getRecentTracksForUser = function (username, pageNum) {
    var deferred = q.defer();
    var url = "http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&api_key=0900562e22abd0500f0432147482cfc1&format=json&limit=200";
    url += "&page=" + pageNum;
    url += "&user=" + username;

    logDebug(req, username, 'getting recent tracks for user: url', url)
    request({
      method: 'GET',
      uri: url,
      gzip: true
    }, function (error, response, body) {
      if(error){  
        logError(req, username, error);
        logDebug(new Error().stack);
        deferred.reject(error);
      }
      else{
        var recentTrackData = JSON.parse(body);

        if(recentTrackData === undefined){
          logError(req, username, 'recent track data is undefined, request url:', url);
          deferred.reject('recent track data is undefined for user ' + username);
        }

        if (recentTrackData.error) {
          logError(req, username, 'couldn\'t fetch the events: recentDataTrack.error', recentTrackData.error);
          deferred.reject(recentTrackData.error);
        }
        else {
          if(recentTrackData.recenttracks === undefined){
            logError(req, username, 'recenttracks is undefined, request url:', url);
            deferred.reject('recenttracks is undefined for user ' + username);
          }

          if(recentTrackData.recenttracks.track === undefined){
            logError(req, username, 'recenttracks.track is undefined, request url:', url);
            deferred.reject('recenttracks.track is undefined for user ' + username);
          }

          // sometimes we seem to get back a single track, not inside an array
          if(recentTrackData.recenttracks.track.length === undefined){
            recentTrackData.recenttracks.track = [recentTrackData.recenttracks.track];
          }

          logDebug(req, username, 'recenttracks count: ', recentTrackData.recenttracks.track.length);
          logSilly(req, username, 'recenttracks.track', recentTrackData.recenttracks.track);
          deferred.resolve(recentTrackData.recenttracks.track);
        }
      }
    });
    return deferred.promise;
  };

  var fetchRecentTracks = function (pagesToBeFetched) {
    if(pagesToBeFetched === undefined){
      logWarning(req, username, 'pages to be fetched is undefined');
      throw 'pages to be fetched is undefined for user ' + username;
    }

    return pagesToBeFetched
      .reduce(function (chain, page) {
        logDebug(req, username, "creating promise chain for page: ", page);
        return chain
          .then(function () {
            return getRecentTracksForUser(username, page)
          })
          .then(create1SelfEvents)
          .then(sendEventsTo1self)
          .then(function (body) {
            logInfo(req, username, "events sent to 1self: page", page);
          }, function (error) {
            logError.log(req, username, "error sending page: page, err ", [page, error]);
          });
      }, q.resolve());

  };
  var createSyncStartEvent = function () {
    return {
      "dateTime": new Date().toISOString(),
      "objectTags": ["1self", "integration", "sync"],
      "actionTags": ["start"],
      "source": "last.fm",
      "properties": {
      }
    };
  };
  var createSyncCompleteEvent = function () {
    return {
      "dateTime": new Date().toISOString(),
      "objectTags": ["1self", "integration", "sync"],
      "actionTags": ["complete"],
      "source": "last.fm",
      "properties": {
      }
    };
  };

  var send1SelfSyncEvent = function (event) {
    var deferred = q.defer();

    var syncEventPostApi = ONESELF_API + '/v1/streams/' + streamId + '/events';
    logDebug(req, username, 'sending sync event: syncEventPostApi, event', [syncEventPostApi, event]);
    request({
      method: 'POST',
      uri: syncEventPostApi,
      gzip: true,
      headers: {
        'Authorization': writeToken,
        'Content-type': 'application/json'
      },
      json: true,
      body: event
    }, function (err, response, body) {
      if (err) {
        logDebug(req, username, 'error sending sync event: error', err);
        deferred.reject(err);
      }
      if (response.statusCode === 404) {
        logDebug(req, username, 'error sending sync event: responseCode', response.statusCode);
        deferred.reject("Stream Not Found!");
      }
      deferred.resolve(body);
    });
    return deferred.promise;
  };

  var numberOfPagesToFetch = function (username, lastSyncDate) {
    var deferred = q.defer();
    var limit = 200;
    var url = "http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&api_key=0900562e22abd0500f0432147482cfc1&format=json&limit=200";
    url += "&user=" + username;
    if (lastSyncField !== undefined && lastSyncField !== '{{latestSyncField}}') {
      var unixTimeStamp = Date.parse(lastSyncField) / 1000;
      url += "&from=" + unixTimeStamp;
    }

    logDebug(req, username, 'calculating number of pages to fetch: url', url);

    request({
      method: 'GET',
      uri: url,
      gzip: true
    }, function (error, response, body) {
      if (error) {
        deferred.reject(error);
      }
      var data = JSON.parse(body);
      logSilly(req, username, "lastfm returned pages: data", data);
      if(data.recenttracks && data.recenttracks["@attr"]){
        var totalPages = data.recenttracks["@attr"].totalPages;
        logDebug(req, username, "totalPages", totalPages);
        deferred.resolve(parseInt(totalPages));
      }
      else {
        deferred.reject("No pages to fetch!");
      }
    });
    return deferred.promise;
  };

  var start = process.hrtime();
  var syncStartEvent = createSyncStartEvent();
  send1SelfSyncEvent(syncStartEvent)
    .then(function () {
      logInfo(req, username, 'sync started, lastSyncField:', lastSyncField);
      return numberOfPagesToFetch(username, lastSyncField);
    })
    .then(createPagesToFetch, function(){
      res.status(200).send("Nothing to sync, everything up-to-date...");
    })
    .then(fetchRecentTracks)
    .then(function () {
      var diff = process.hrtime(start);
      logInfo(req, username, 'sync complete, took:', diff);
      var syncCompleteEvent = createSyncCompleteEvent();
      return send1SelfSyncEvent(syncCompleteEvent);
    })
    .then(function () {
      res.status(200).send("Synced all the events");
    })
    .catch(function(error) {
      logError(req, username, "error sycning, error:", error);
    })
};




