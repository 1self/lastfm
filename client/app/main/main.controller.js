'use strict';

angular.module('lastfmApp')
  .controller('MainCtrl', function ($location, $scope, $sce, $http) {
    $scope.setupSync = function () {
      var postMessage = {};
      postMessage.username = $scope.name;
      postMessage.oneselfUsername = $location.search().username;
      postMessage.registrationToken = $location.search().token;
      postMessage.redirectUri = $location.search().redirect_uri;
      console.log(postMessage);
      $http.post('/api/setup', postMessage)
        .success(function (data) {
          window.location.href = data.redirect;
          //window.location.href = "https://app-staging.1self.co/integrations";
          //window.location.href = "https://app.1self.co/integrations";
        })
        .error(function (err) {
          console.log('error : ' + err);
        });
    };
  });
