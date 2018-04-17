var dotenv = require('dotenv').config()
dotenv.load()
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');
var browserify = require('browserify');
var idb =  require('idb');
var indexRouter = require('./routes/index');

var app = express();

app.use(cors);
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use('/', indexRouter);

module.exports = app;
