'use strict';

angular.module('lastfmApp')
  .controller('MainCtrl', function ($scope, $http) {
    // $scope.awesomeThings = [];
   // console.log('click'); 

    // $http.get('/api/things').success(function(awesomeThings) {
    //   $scope.awesomeThings = awesomeThings;

    $scope.setupSync = function() {
    	console.log('click');
    	console.log($scope.name);

    	var postMessage = {};
    	postMessage.username = $scope.name;
    	$http.post('/api/things', postMessage).success(function(awesomeThings) {
        	console.log('success');
    	});
    }
 });
