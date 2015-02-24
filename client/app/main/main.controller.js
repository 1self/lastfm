'use strict';

angular.module('lastfmApp')
  .controller('MainCtrl', function ($location, $scope, $sce, $http) {
    $scope.setupSync = function () {
      var postMessage = {};
      postMessage.username = $scope.name;
      postMessage.oneselfUsername = $location.search().username;
      postMessage.registrationToken = $location.search().token;
      console.log(postMessage);
      $http.post('/api/setup', postMessage)
        .success(function (data) {
          window.location.href = "http://localhost:5000/dashboard";
        })
        .error(function (err) {
          console.log('error : ' + err);
        });
    }
  });
