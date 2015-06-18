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

var logError = function(req, username, message, object){
  req.app.logger.error(username + ': ' + message, object);
}

exports.index = function (req, res) {

  var username = req.query.username;
  var lastSyncDate = req.query.latestSyncField;
  var streamId = req.query.streamid;
  var writeToken = req.headers.authorization;

  logInfo(req, username, 'starting sync: lastSyncDate, streamId, writeToken', [lastSyncDate, streamId, writeToken]);
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
    logInfo(req, username, 'sending events to batchapi, batchApiUri, writeToken', [batchApiUri, writeToken]);
    logDebug(req, username, 'batch events', events);
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
        if (recentTrackData.error) {
          logDebug(req, username, 'couldn\'t fetch the events: recentDataTrack.error', recentTrackData.error);
          deferred.reject(recentTrackData.error);
        }
        else {
          logDebug(req, username, 'recenttracks.track', recentTrackData.recenttracks.track);
          deferred.resolve(recentTrackData.recenttracks.track);
        }
      }
    });
    return deferred.promise;
  };

  var fetchRecentTracks = function (pagesToBeFetched) {
    return pagesToBeFetched
      .reduce(function (chain, page) {
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
    if (lastSyncDate !== undefined) {
      var unixTimeStamp = Date.parse(lastSyncDate) / 1000;
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
      logDebug(req, username, "lastfm returned pages: data", data);
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

  var syncStartEvent = createSyncStartEvent();
  send1SelfSyncEvent(syncStartEvent)
    .then(function () {
      logInfo(req, username, 'sync started');
      return numberOfPagesToFetch(username, lastSyncDate);
    })
    .then(createPagesToFetch, function(){
      res.status(200).send("Nothing to sync, everything up-to-date...");
    })
    .then(fetchRecentTracks)
    .then(function () {
      logInfo(req, username, 'sync complete');
      var syncCompleteEvent = createSyncCompleteEvent();
      return send1SelfSyncEvent(syncCompleteEvent);
    })
    .then(function () {
      res.status(200).send("Synced all the events");
    })
};




