/**
 * Main application file
 */

'use strict';

// Set default node environment to development
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

var path = require('path');
var express = require('express');
var config = require('./config/environment');
// Setup server
var app = express();
var server = require('http').createServer(app);
require('./config/express')(app);
require('./routes')(app);

var logfileLocation = process.env.LOGFILE_LOCATION || './';
var loggingfilename = path.join(logfileLocation, 'lastfm.log');
var winston = require('winston');

winston.level = 'debug';
winston.add(winston.transports.File, { filename: 'lastfm.log', level: 'debug', json: false });
winston.error('Errors will be logged here');
winston.warn('Warns will be logged here');
winston.info('Info will be logged here');
winston.verbose('Verbose will be logged here');
winston.debug('Debug will be logged here');
winston.silly('Silly will be logged here');

app.logger = winston;

app.logger.info('PORT=' + process.env.PORT);
  
// Start server
server.listen(config.port, config.ip, function () {
  app.logger.log('info','Express server listening on %d, in %s mode', config.port, app.get('env'));
});

// Expose app
exports = module.exports = app;
