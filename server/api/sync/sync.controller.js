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
  req.app.logger.warn(username + ': ' + message, object);
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

    return result;
  };

  var create1SelfEvents = function (recentTracksInfo) {
    var warnListenDateCount = 0;

    var result = recentTracksInfo
    .map(function (recentTrackInfo) {
      var dt = new Date();

      // you don't get a date for tracks that are currently playing. We'll
      // get this data when the current listen of the track is over
      if(recentTrackInfo["@attr"] && recentTrackInfo["@attr"].nowplaying){
        return null;
      }

      // sometimes lastfm has data that it doesn't know the precise date for.
      // we ignore those here:
      var listenDate = recentTrackInfo.date.uts * 1;
      if(listenDate === 0){
        logSilly(req, username, 'ignoring track play with unknown date', recentTrackInfo);
        warnListenDateCount++;
        return null;  
      }

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
        "latestSyncField": {
          "$date": dt.toISOString()
        }
      };
    })
    .filter(function(value){
      return value !== null;
    });

    if(warnListenDateCount > 0){
      logWarning(req, username, warnListenDateCount + " had no listen date", '');
    }

    return result;
  };

  var sendEventsTo1self = function (events) {
    if(events.length === 0){
      logDebug(req, username, 'no events to send', '');
      return events;
    }
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
        return;
      }
      
      if (response.statusCode === 404) {
        deferred.reject("Stream Not Found!")
      }
      deferred.resolve(body);
    });
    return deferred.promise;
  };

  var getRecentTracksForUser = function (username, pageNum, lastSyncField) {
    var deferred = q.defer();
    var url = "http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&api_key=0900562e22abd0500f0432147482cfc1&format=json&limit=200";
    url += "&page=" + pageNum;
    url += "&user=" + username;
    url = addLastSyncToUrl(url, lastSyncField);

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
          return;
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

  var fetchRecentTracks = function (pagesToBeFetched, lastSyncField) {
    if(pagesToBeFetched === undefined){
      logWarning(req, username, 'pages to be fetched is undefined');
      throw 'pages to be fetched is undefined for user ' + username;
    }

    return pagesToBeFetched
      .reduce(function (chain, page) {
        logDebug(req, username, "creating promise chain for page: ", page);
        return chain
          .then(function () {
            return getRecentTracksForUser(username, page, lastSyncField)
          })
          .then(create1SelfEvents)
          .then(sendEventsTo1self)
          .then(function (body) {
            logInfo(req, username, "events sent to 1self: page", page);
          }, function (error) {
            logError(req, username, "error sending page: page, err ", [page, error]);
          });
      }, q.resolve());

  };
  
  var createSyncStartEvent = function () {
    return {
      "dateTime": new Date().toISOString(),
      "objectTags": ["1self", "integration", "sync"],
      "actionTags": ["start"],
      "properties": {
      }
    };
  };

  var createSyncErrorEvent = function (error) {
    return {
      "dateTime": new Date().toISOString(),
      "objectTags": ["1self", "integration", "sync"],
      "actionTags": ["error"],
      "properties": {
          "code": error.code,
          "message": error.message
      }
    };
  };

  var createSyncCompleteEvent = function () {
    return {
      "dateTime": new Date().toISOString(),
      "objectTags": ["1self", "integration", "sync"],
      "actionTags": ["complete"],
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
        return;
      }

      if (response.statusCode === 404) {
        logDebug(req, username, 'error sending sync event: responseCode', response.statusCode);
        deferred.reject("Stream Not Found!");
        return;
      }

      deferred.resolve(body);
    });
    return deferred.promise;
  };

  var addLastSyncToUrl = function(url, lastSyncDate){
    if (lastSyncField !== undefined && lastSyncField !== '{{latestSyncField}}') {
      var unixTimeStamp = Date.parse(lastSyncField) / 1000;
      // the lastfm api works on a greater than or equal to basis for the from field
      // This means we need to add one to the timestamp to ensure we don't get the last
      // event from the previous sync.
      var adjustedUnixTimeStamp = unixTimeStamp + 1;
      logDebug(req, 'incrementing the lastsyncfield, ', [unixTimeStamp, adjustedUnixTimeStamp]);
      url += "&from=" + adjustedUnixTimeStamp;  
    }

    return url;
  }
  var numberOfPagesToFetch = function (username, lastSyncDate) {
    var deferred = q.defer();
    var limit = 200;
    var url = "http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&api_key=0900562e22abd0500f0432147482cfc1&format=json&limit=200";
    url += "&user=" + username;
    url = addLastSyncToUrl(url, lastSyncDate, req);

    logDebug(req, username, 'calculating number of pages to fetch: url', url);

    request({
      method: 'GET',
      uri: url,
      gzip: true
    }, function (error, response, body) {
      if (error) {
        deferred.reject(error);
        return;
      }

      var data = JSON.parse(body);
      logSilly(req, username, "lastfm returned pages: data", data);
      if(data.recenttracks && data.recenttracks["@attr"]){
        var totalPages = data.recenttracks["@attr"].totalPages;
        var totalTracks = data.recenttracks["@attr"].total;
        logDebug(req, username, "totalPages", totalPages);
        logDebug(req, username, 'total tracks', totalTracks)

        deferred.resolve(parseInt(totalPages));
      }
      else if(data.error === 6){
        deferred.reject({
          code: 404,
          message: "user not found"
        })
      }
      else {        
        deferred.reject({
          code: 500,
          message: "No pages found for user"
        });
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
    }, function() {})
    .then(createPagesToFetch)
    .then(function(pagesToBeFetched){
      if(pagesToBeFetched === []){
        res.status(200).send("Nothing to sync, everything up-to-date...");
        return pagesToBeFetched;
      }
      return fetchRecentTracks(pagesToBeFetched, lastSyncField);
    })
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
      send1SelfSyncEvent(createSyncErrorEvent(error))
      .then(function(){
        res.status(500).send(error.message);
      })
      logError(req, username, "error sycning, error:", error);
    })
};




