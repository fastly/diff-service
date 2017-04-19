const express = require('express');


const app = express();
const PORT = process.PORT || 3007;

process.chdir(__dirname + '/../');

const functions = require('../index');
app.use('/', functions.compareURLs);

app.listen(PORT, function () {
  console.log('Test app listening on port ' + PORT)
})
