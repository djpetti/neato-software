function main() {
  // Get initial data.
  updateBattery();
  updateCharging();

  logging = new Logging();
  lidar = new LidarDisplayer();
  movement = new Movement();

  setInterval(updateBattery, 10000);
  setInterval(updateCharging, 10000);
  setInterval(function() {
    logging.update();
  }, 1000);
  setInterval(function() {
    lidar.update();
  }, 2000);
  setInterval(function() {
    movement.keepAlive();
  }, 1000);
}

// A class for handling movement control.
function Movement() {
  this.enabled = false;
  this.last_enabled = false;
  this.driving = false;
  this.turning = false;

  // Tell the backend we're still alive.
  this.keepAlive = function() {
    if (this.enabled) {
      $.post("feed_watchdog/", function() {});
    }
  };

  // Handles key presses.
  this.handleKeys = function(evn) {
    if (this.enabled) {
      console.log(evn.which);
      if (evn.which === 38 && !this.driving) {
        $.post("drive_forward/", function() {});
        this.driving = "drive_forward/";
      } else if (evn.which === 40 && !this.driving) {
        $.post("drive_backward/", function() {});
        this.driving = "drive_backward/";
      } else if (evn.which === 37 && !this.turning) {
        $.post("turn_left/", function() {});
        this.turning = "turn_left/";
      } else if (evn.which === 39 && !this.turning) {
        $.post("turn_right/", function() {});
        this.turning = "turn_right/";
      }

      evn.preventDefault();
      return false;
    }
  };

  // Handles key release.
  this.handleStop = function(evn) {
    if (this.enabled) {
      if (this.driving && this.turning) {
        // We should have two stops to stop this completely.
        if (evn.which === 38 || evn.which === 40) {
          // Keep turning.
          $.post(this.turning, function() {});
          this.driving = undefined;
          return false;
        } else if (evn.which === 37 || evn.which === 39) {
          // Keep driving.
          $.post(this.driving, function() {});
          this.turning = undefined;
          return false;
        }
      }

      $.post("stop/", function() {});
      this.driving = undefined;
      this.turning = undefined;
      return false;
    }
  };

  this.toggleEnabled = function() {
    if (!this.enabled) {
      $("#enable_rc").text("Click here to disable RC.");
      $("#enable_rc").css("color", "#D11919");
      this.enabled = true;

      // Start watchdog.
      $.post("feed_watchdog/", function() {});
    } else {
      $("#enable_rc").text("Click here to enable RC.");
      $("#enable_rc").css("color", "#009933");
      this.enabled = false;

      // Stop watchdog.
      $.post("stop_watchdog/", function() {});
    }
  };

  var instance = this;
  $("#enable_rc").click(function() {
    instance.toggleEnabled();
  });

  // Set up key bindings.
  var instance = this;
  $(document).keydown(function(evn) {
    instance.handleKeys(evn);
  });
  $(document).keyup(function(evn) {
    instance.handleStop(evn);
  });
}

// A helper class for creating persistent log text.
function LogText(context, text, color, y) {
  this.context = context;
  this.text = text;
  this.size = 14;
  this.color = color;
  this.y = y;
  // Height of the canvas.
  this.height = this.context.canvas.height;
  // Keeps track of the current bounding box around text.
  var half_size = this.size / 2;
  this.bounding_box = [0, y, 500, y + this.size];

  this.__draw = function() {
    this.context.font = this.size + "px Arial";
    this.context.fillStyle = color;
    this.context.textAlign = "left";
    this.context.textBaseline = "top";
    this.context.fillText(this.text, 0, this.y);
  };

  this.clear = function() {
    this.context.clearRect.apply(this.context, this.bounding_box);
  };

  // Change the text.
  this.setText = function(text) {
    this.text = text;
    this.clear();
    this.__draw();
  };

  // Change the font.
  this.setFont = function(font) {
    this.context.font = font;
    this.clear();
    this.__draw();
  };

  // Change the color.
  this.setColor = function(color) {
    this.color = color;
    this.clear();
    this.__draw();
  }

  // Shifts the Y position of the text.
  this.move = function(y_amount) {
    // Do this before we change the bounding box.
    this.clear();

    this.bounding_box[1] += y_amount;
    this.bounding_box[3] += y_amount;
    this.y += y_amount;

    this.__draw();
  };

  this.__draw();
}

// Class for handling the LIDAR widget.
function LidarDisplayer() {
  // The context we are drawing with.
  this.context = document.getElementById("lidar_display").getContext("2d");
  this.has_click = false;
  this.is_active = false;

  // Shows a single point.
  this.__show_dot = function(angle, distance) {
    // Calculate x and y coordinates. This is basically just converting polar to
    // cartesian.
    var rads = angle * Math.PI / 180;
    var x = distance * Math.cos(rads);
    var y = distance * Math.sin(rads);

    // Map these to the upside-down first quadrant.
    x += 250;
    y += 250;
    y = 500 - y;

    // Draw a circle.
    this.context.beginPath();
    this.context.arc(x, y, 5, 0, 2 * Math.PI);
    this.context.fillStyle = "#1947D1";
    this.context.fill();
  };

  // Displays a packet.
  this.__show_packet = function(data) {
    // Clear display.
    this.context.clearRect(0, 0, 500, 500);

    var packet = JSON.parse(data);
    var factor = 1;

    // Normalize distances for our display.
    var biggest = 0;
    for (i = 0; i < Object.keys(packet).length; ++i) {
      var line = packet[String(i)];
      if (line) {
        var distance = Number(line[0]);
        biggest = Math.max(biggest, distance);
      }
    }

    factor = 250 / parseFloat(biggest);

    // Draw a dot for each reading.
    for (i = 0; i < Object.keys(packet).length; ++i) {
      var line = packet[String(i)];
      if (line) {
        var distance = Number(line[0]) * factor;
        this.__show_dot(i, distance);
      }
    }

    // Draw scale indicator.
    var scale = biggest * 2;
    this.context.fillStyle = "#000000";
    this.context.font = "16px Arial";
    this.context.textAlign = "center";
    this.context.fillText("Width = " + scale + " mm", 250, 488);
  };

  this.inactive = function() {
    this.context.clearRect(0, 0, 500, 500);

    this.context.font = "30px Arial";
    this.context.fillStyle = "#990000";
    this.context.textAlign = "center";
    this.context.fillText("LIDAR not active.", 250, 234);

    this.context.font = "16px Arial"
    this.context.fillStyle = "#5E5E3A";
    this.context.fillText("Click here to turn it on.", 250, 259);
  };

  this.update = function() {
    if (this.is_active) {
      // Get the latest data from the LDS.
      if (this.has_click) {
        $("#lidar_display").off("click");
      }

      // Get the packet.
      var instance = this;
      $.get("lds/", function(data) {
        instance.__show_packet(data);
      });

    } else {
      // Set up click event.
      if (!this.has_click) {
        $("#lidar_display").click(function() {
          $.post("lds_active/", function(data) {});
        });
        this.has_click = true;
      }
    }

    this.check_active();
  };

  // Check if LDS is active.
  this.check_active = function() {
    var instance = this;
    $.get("lds_active/", function(data) {
      if (!Number(data)) {
        instance.inactive();
        instance.is_active = false;
      } else {
        instance.is_active = true;
      }
    });
  };

  this.check_active();
}

// Class for handling the log widget.
function LogDisplayer() {
  // An array of LogText objects currently being shown.
  this.showing = [];
  // Whether or not the displayer is clear.
  this.is_clear = false;

  // The canvas we are drawing on.
  this.context = document.getElementById("log_display").getContext("2d");
  // Set correct canvas size.
  this.height = $(window).height() - 100;
  this.context.canvas.height = this.height;

  this.clear = function() {
    this.context.clearRect(0, 0, 500, this.height);

    this.context.font = "30px Arial";
    this.context.fillStyle = "#A3A375";
    this.context.textAlign = "center";
    this.context.fillText("No Messages.", 250, this.height / 2);

    this.is_clear = true;
  };

  this.addMessage = function(message) {
    if (this.is_clear) {
      // Remove "No Messages" text.
      this.context.clearRect(0, 0, 500, 500);
      this.is_clear = false;
    }

    // Format the message correctly.
    var date = new Date();
    var formatted = "[" + message[1] + "@" + date.toLocaleTimeString() + "] "
        + message[0] + ": " + message[2];

    // Move all the current messages up.
    var to_delete = 0;
    for (var i = 0; i < this.showing.length; ++i) {
      var value = this.showing[i];

      if (value.y <= 15) {
        value.clear();
        ++to_delete;
      } else {
        value.move(-18);
      }
    }
    // Remove old messages.
    for (var i = 0; i < to_delete; ++i) {
      this.showing.shift();
    }

    // Change the color if needed.
    if (message[0] == "WARNING") {
      var color = "#FF3300";
    } else if (message[0] == "ERROR") {
      var color = "#FF0000";
    } else if (message[0] == "FATAL") {
      var color = "#800000";
    } else {
      var color = "#000000";
    }

    // Add the new message.
    this.showing.push(new LogText(this.context, formatted,
        color, this.height - 24));
  };

  this.clear();
}

function updateBattery() {
  $.get("battery", function(data) {
    $("#voltage").text("Battery: " + data + "%");

    // Give it a nice color.
    if (Number(data) >= 95) {
      $("#voltage").css("color", "green");
    } else if (Number(data) <= 20) {
      $("#voltage").css("color", "red");
    }
  });
}

function updateCharging() {
  $.get("charging", function(data) {
    if (Number(data)) {
      $("#charging").text("Charging");
      $("#charging").css("color", "green");
    } else {
      $("#charging").text("Not Charging");
      $("#charging").css("color", "red");
    }
  });
}

function Logging() {
  this.displayer = new LogDisplayer();
  // Keeps track of whether an ajax request is already running.
  this.ajax_pending = false;

  this.update = function() {
    var instance = this;

    if (!this.ajax_pending) {
      $.get("logging", function(data) {
        instance.ajax_pending = false;

        var messages = JSON.parse(data);

        // Show the messages.
        for (var i = 0; i < messages.length; ++i) {
          instance.displayer.addMessage(messages[i]);
        }
      });
    }
    this.ajax_pending = true;
  };
}

$(document).ready(main);
