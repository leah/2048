function DataManager() {

  var APP_KEY = 'zg2re9x4b5lonfi';

  moment.lang('en', {
    calendar: {
      lastDay: '[Yesterday]',
      sameDay: '[Today]',
      nextDay: '',
      lastWeek: 'MMM Do',
      nextWeek: '',
      sameElse: 'MMM Do'
    }
  });

  this.events = {};
  this.client = new Dropbox.Client({ key: APP_KEY });
  this.scoresCount = 3;

  // Check if logged in
  this.client.authenticate({ interactive: false });
  if (this.client.isAuthenticated()) {
    this.loggedIn();
  } else {
    // Show the Dropbox login
    document.querySelector(".dropbox-login").style.display = "block";

    // Schedule for after the setup event handler is registered
    window.setTimeout((function () { this.emit("setup") }).bind(this), 0);
  }

  // Login listener
  var login = document.querySelector(".login");
  login.addEventListener("click", this.login.bind(this));

  // Logout listener
  var logout = document.querySelector(".logout");
  logout.addEventListener("click", this.logout.bind(this));
}

DataManager.prototype.on = function (event, callback) {
  if (!this.events[event]) {
    this.events[event] = [];
  }
  this.events[event].push(callback);
};

DataManager.prototype.emit = function (event, data) {
  var callbacks = this.events[event];
  if (callbacks) {
    callbacks.forEach(function (callback) {
      callback(data);
    });
  }
};

// Verifies that the user has connected with Dropbox
DataManager.prototype.isConnected = function () {
  return this.client.isAuthenticated();
};

// Perform actions after user is determined to be logged in
DataManager.prototype.loggedIn = function (event) {

  // Show the high scores
  document.querySelector(".dropbox-login").style.display = "none";
  document.querySelector(".high-scores").style.display = "block";

  // Open the datastore manager
  this.datastoreManager = new Dropbox.Datastore.DatastoreManager(this.client);

  // Open the default datastore
  var that = this;
  this.datastoreManager.openDefaultDatastore(function (err, datastore) {
    if (err) { alert('Error: ' + err); return; }

    // Initialize datastore
    that.datastore = datastore;
    that.datastore.recordsChanged.addListener(that.updateScoreDisplay.bind(that));

    // Check for saved game state
    var record = that.datastore.getTable("state").get("current_game");
    if (record) {
      that.emit("setup", {
        score: record.get("score"),
        grid: record.get("grid").toArray()
      });
    } else {
      that.emit("setup");
    }

    // Display high scores
    that.updateScoreDisplay();
  });
};

// Log in to Dropbox
DataManager.prototype.login = function (event) {
  event.preventDefault();

  this.client.authenticate(function (err) {
    if (err) { alert('Error: ' + err); return; }
    this.loggedIn();
  });
};

// Log out of Dropbox
DataManager.prototype.logout = function (event) {
  console.log("logout");
  event.preventDefault();
  this.client.signOut();
  this.datastore = null;

  // Show the Dropbox login
  document.querySelector(".high-scores").style.display = "none";
  document.querySelector(".dropbox-login").style.display = "block";
};

// Save game state
DataManager.prototype.saveGameState = function (state) {
  if (this.datastore) {
    this.datastore.getTable("state").getOrInsert("current_game").update(state);
  }
};

// Highest scores
DataManager.prototype.getSortedScores = function () {

  var table = this.datastore.getTable('scores');
  var scores = table.query();

  scores.sort(function(a, b) {
    if (a.get("score") > b.get("score")) {
      return -1;
    } else if (a.get("score") < b.get("score")) {
      return 1;
    }
    return 0;
  });

  return scores;
};

// Possibly add a new high score
DataManager.prototype.addScore = function (score, grid) {

  if (this.datastore) {

    // New high score?
    var scores = this.getSortedScores();
    var lastIndex = Math.min(scores.length, this.scoresCount) - 1;
    if (scores.length < this.scoresCount || scores[lastIndex].get("score") < score) {

      // Find max tile
      var maxTile = 0;
      grid.eachCell(function(x, y, tile) {
        if (tile) {
          if (tile.value > maxTile) {
            maxTile = tile.value;
          }
        }
      });

      // Add new high score record in datastore
      this.datastore.getTable("scores").insert({
        "score" : score,
        "max_tile": maxTile,
        "date": new Date(),
      });

      this.updateScoreDisplay();
    }

    // Truncate list to 5 scores
    scores = this.getSortedScores();
    for (var i = this.scoresCount; i < scores.length; i++) {
      scores[i].deleteRecord();
    }
  }
};

// Update high score display
DataManager.prototype.updateScoreDisplay = function () {
  var scores = this.getSortedScores();

  for (var i = 0; i < this.scoresCount && i < scores.length; i++) {
    document.getElementsByClassName("data-score-container")[i].textContent = scores[i].get("score");
    document.getElementsByClassName("max-tile-container")[i].textContent = scores[i].get("max_tile");
    document.getElementsByClassName("date-container")[i].textContent = moment(scores[i].get("date")).calendar();
  }
}
