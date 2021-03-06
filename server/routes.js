/**
 * Main application routes
 */

'use strict';

var errors = require('./components/errors');

module.exports = function(app) {

  // Insert routes below
  console.log('setting up routes');
  app.use('/api/sync', require('./api/sync'));
  app.use('/api/setup', require('./api/setup'));
  // All undefined asset or api routes should return a 404
  // app.route('/:url(auth|components|app|bower_components|assets)/*')
  //  .get(errors[404]);

  // All other routes should redirect to the index.html
  app.route('/*')
    .get(function(req, res) {
	console.log('sending ' + app.get('appPath') + '/index.html');
      res.sendfile(app.get('appPath') + '/index.html');
    });
};
