'use strict';

var express = require('express');
var controller = require('./sync.controller');

var router = express.Router();

router.get('/', controller.index);
router.post	('/', controller.index);

module.exports = router;