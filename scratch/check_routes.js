const express = require('express');
const app = require('./index'); // This won't work because index.js doesn't export app

// Let's modify index.js to export app for testing
