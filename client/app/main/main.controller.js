'use strict';

angular.module('lastfmApp')
    .controller('MainCtrl', function ($location, $scope, $sce, $http) {
        $scope.setupSync = function () {
            var postMessage = {};
            postMessage.username = $scope.name;
            postMessage.token = $location.search().token;
            console.log(postMessage);
            $http.post('/api/setup', postMessage)
                .success(function (data) {
                    window.location.href = data.redirectUrl;
                })
                .error(function (err) {
                    console.log('error : ' + err);
                });
        }
    });
