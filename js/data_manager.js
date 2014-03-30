function DataManager() {

  var APP_KEY = '3f1wo55197c4lrc';

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

  this.emit("persistLocally");

  this.client.authenticate(function (err) {
    if (err) { alert('Error: ' + err); return; }
    this.loggedIn();
  });
};

// Log out of Dropbox
DataManager.prototype.logout = function (event) {
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

// Clear game state
DataManager.prototype.clearGameState = function (state) {
  if (this.datastore) {
    var record = this.datastore.getTable("state").get("current_game");
    if (record !== null) {
      record.deleteRecord();
    }
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

// Find max tile
DataManager.prototype.maxTile = function(grid) {

  var maxTile = 0;
  grid.eachCell(function(x, y, tile) {
      if (tile) {
          if (tile.value > maxTile) {
              maxTile = tile.value;
          }
      }
  });

  return maxTile;
};

// Possibly add a new high score
DataManager.prototype.addScore = function (score, grid) {

  if (this.datastore) {

    // Check if current game score has increased
    var currentGame = this.datastore.getTable("state").get("current_game");
    if (currentGame) {

      // Game score hasn't increased
      if (currentGame.get("score") >= score) { return; }

      // Check if current game is already in the high scores list and update score
      var scoreId = currentGame.get("score_id");
      if (scoreId && this.datastore.getTable("scores").get(scoreId)) {
        this.datastore.getTable("scores").get(scoreId).set("score", score);
        this.datastore.getTable("scores").get(scoreId).set("max_tile", this.maxTile(grid));
        this.updateScoreDisplay();
        return;
      }
    }

    // New high score?
    var scores = this.getSortedScores();
    var lastIndex = Math.min(scores.length, this.scoresCount) - 1;
    if (scores.length < this.scoresCount || scores[lastIndex].get("score") < score) {

      // Add new high score record in datastore
      var scoreRecord = this.datastore.getTable("scores").insert({
        "score" : score,
        "max_tile": this.maxTile(grid),
        "date": new Date(),
      });

      // Save the associated high score in the current game record
      if (currentGame) {
        currentGame.set("score_id", scoreRecord.getId());
      }

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

  document.querySelector(".high-scores-title").style.display = scores.length > 0 ? "block" : "none";

  for (var i = 0; i < this.scoresCount; i++) {
    if (i < scores.length) {
      // Display high score
      document.getElementsByClassName("data-scores-container")[i].style.display = "block";
      document.getElementsByClassName("data-score-container")[i].textContent = scores[i].get("score");
      document.getElementsByClassName("max-tile-container")[i].textContent = scores[i].get("max_tile");
      document.getElementsByClassName("date-container")[i].textContent = moment(scores[i].get("date")).calendar();
    } else {
      // Not enough high scores to fill the table yet
      document.getElementsByClassName("data-scores-container")[i].style.display = "none";
    }
  }
}
