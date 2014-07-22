/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

"use strict";

var config = {
  releases: ["1.3", "1.3T", "1.4", "2.0", "2.1", "2.2", "2.3", "2.4", "2.5"], // which releases to show
  flag: "cf_blocking_b2g", // name of the release flag to use
  feature_flag: "cf_feature_b2g", 
  reload: 300, // reload every this many seconds (0 means disabled)
  maxAge: 7, // maximum age in days (deep red when showing activity)
  filtercomponents: null, // don't filter any specific components
  filterowners: null, // don't filter any specific owners
};

// Parse the url and extract configuration information.
parseQueryString(function (name, value, integer, bool, list) {
  switch (name) {
  case "releases":
    config.releases = list;
    break;
  case "filtercomponents":
  case "filterowners":
    config[name] = {};
    $.each(list, function (_, component) {
      config[name][component] = true;
    });
    break;
  case "reload":
    config.reload = integer;
    break;
  case "owners":
  case "activity":
    if (bool)
      $("div#toggle" + name.charAt(0).toUpperCase() + name.slice(1)).addClass("checked");
    break;
  case "maxage":
    config.maxAge = integer;
    break;
  case "flag":
    config.flag = value;
    break;
  case "feature":
    config.feature_flag = value;
    break;
  case "nomenu":
    $("div#menu").hide();
    $("div#title").text(value);
    break;
  }
});

// Flags we will filter by and the results of the bug queries.
config.nomination_value = suffix(config.releases, "?");
config.blocking_value = suffix(config.releases, "+");
config.feature_value = config.releases;

// Last fetched data model.
var data = {
  nominations: [],
  untriaged: [],
  blocking: [], 
  blockers: [],
  features: []
};

// Initially hide the body and fade it in when we get some data to show.
$("body").hide();

$("div#toggleOwners, div#toggleActivity").click(function () {
  var checkbox = $(this);
  checkbox.toggleClass("checked");
  refresh();
});

$("div#help").hide();

$("div#toggleHelp").click(function () {
  var checkbox = $(this);
  checkbox.toggleClass("checked");
  $("div#help").toggle(400);
});

function refresh() {
  // Assign a unique color and return it as a class declaration
  var getUniqueColor = (function () {
    var color = 0;
    return function () {
      return "class='color" + (color++) + "'";
    };
  })();

  // Get the color for a release as a class declaration
  var getReleaseColor = (function () {
    var colors = [];
    return function (canonical) {
      if (!(canonical in colors)) {
        colors[canonical] = getUniqueColor();
      }
      return colors[canonical];
    };
  })();

  function rgb(r, g, b) {
    return "rgb(" + Math.round(255 * r) + "," + Math.round(255 * g) + "," + Math.round(255 * b) + ")";
  }

  // Get a color based on a status (0..1, 0 is red, 1 is green).
  function getStatusColor(status) {
    return "style='background-color: " + rgb(1-status, status, 0) + "'";
  }

  // Create a search query link for bugzilla we can redirect to.
  function getLink(release, component, assigned_to) {
    var url = "https://bugzilla.mozilla.org/buglist.cgi?";
    var args = [];

    function push(field, value) {
      if (typeof value === "object") {
        $.each(value, function (_, v) {
          push(field, v);
        });
        return;
      }
      args.push([field, value]);
    }

    push("bug_status", ["UNCONFIRMED", "NEW", "ASSIGNED", "REOPENED"]);
    if (release)
    {
      if (release.indexOf("?") > -1 || release.indexOf("+") > -1)
        push(config.flag, release);
      else
        push(config.feature_flag, release);
    }
    if (component)
      push("component", component);
    if (assigned_to)
      push("assigned_to", assigned_to);
    $.each(args, function (n, arg) {
        args[n] = encodeURIComponent(arg[0]) + "=" + encodeURIComponent(arg[1]);
      });
    return "href='" + url + args.join("&") + "'";
  }

  function brace(s) {
    return "(" + s + ")";
  }

  function formatCount(className, release, component, assigned_to, count) {
    var html = "<a";
    if (className)
      html += " class='" + className + "'";

    html += " " + getLink(release, component, assigned_to);
    html += " target='dashboard'>";
    html += count;
    html += "</a>";
    return html;
  }
  function formatCounts(className, release, component, count) {
    var html = formatCount(className, release, component, null, accumulate(count));
    var unassigned = accumulate(count, "nobody@mozilla.org");
    if (unassigned > 0)
      html += " " + formatCount(className + " unassigned", release, component, "nobody@mozilla.org", brace(unassigned));
    return html;
  }
  function formatStatus(counts, component) {
    var html = "<ul id='status'>";
    var showActivity = $("div#toggleActivity").hasClass("checked");
    eachAlphabetically(counts, function (release, count) {
      var color;
      if (showActivity) {
        // Determine the oldest activity.
        var oldest = Date.now();
        $.each(count, function (assigned_to, dates) {
          $.each(dates, function (date) {
            oldest = Math.min(new Date(date).getTime(), oldest);
          });
        });
        // Calculate the age in days and cap to 7 days.
        var age = Math.min(config.maxAge, (Date.now() - oldest) / 1000 / 60 / 60 / 24);
        color = getStatusColor(1 - age / config.maxAge);
      } else {
        color = getReleaseColor(release.replace("+", "").replace("?", ""));
      }
      html += "<li " + color + ">";
      html += "<div class='release'>" + release + "</div>";
      html += formatCounts("count", release, component, count);
      html += "</li>";
    });
    html += "</ul>";
    return html;
  }
  function formatComponents(components) {
    var html = "<ul id='components'>";
    var showOwners = $("div#toggleOwners").hasClass("checked");
    
    eachAlphabetically(components, function (component, counts) {
      var label = (showOwners && (component in OWNERS))
                  ? component + "<p class='componentowner'>" + OWNERS[component] + "</p>"
                  : component;
      html += "<li>";
      html += "<div class='component'>" + label + "</div>";
      html += formatStatus(counts, component);
      html += "</li>";
    });
    
    html += "</ul>";
    return html;
  }

  $("li#noms").empty().append("<div>Nominations: " +
                              formatCounts(null, config.nomination_value, null, data.nominations) +
                              "</div>").append(formatStatus(data.nominations));
  if (data.untriaged) {
    $("li#triage").empty().append("<div>Triage: " +
                                  formatCounts(null, config.blocking_value, "General", data.untriaged) +
                                  "</div>").append(formatStatus(data.untriaged, "General"));
  }
  $("li#blockers").empty().append("<div>Blockers: " +
                                  formatCounts(null, config.blocking_value, null, data.blocking) +
                                  "</div>").append(formatStatus(data.blockers));
  
  $("li#feature").empty().append("<div>Features: " + 
                                  formatCounts(null, config.feature_value, null, data.features) +
                                  "</div>").append(formatStatus(data.features));

  $("li#updatetime").empty().append(new Date());

//alert(dump(data.blocking));
}

function update() {
  function without(obj, field) {
    obj = $.extend(true, {}, obj);
    delete obj[field];
    return obj;
  }

  $.when(
    group(all().blocking(config.nomination_value).open(), [config.flag, "assigned_to", "last_change_time"]).then(function (counts) {
      data.nominations = counts;
    }),
    group(all().blocking(config.blocking_value).open(), [config.flag, "assigned_to", "last_change_time"]).then(function (counts) {
      data.blockers = counts;
    }),
     //For feature-b2g
    group(all().feature(config.feature_value).open(), [config.feature_flag, "assigned_to", "last_change_time"]).then(function (counts) {
      data.features = counts;
    }),
    
    //triage
    group(all().blocking(config.blocking_value).open(), ["component", config.flag, "assigned_to", "last_change_time"]).then(function (counts) {
      data.untriaged = ("General" in counts) ? counts.General : null;
      data.blocking = without(counts, "General");

      // filter for specific components if requested
      if (config.filtercomponents) {
        $.each(data.blocking, function (component) {
          if (!(component in config.filtercomponents))
            delete data.blocking[component];
        });
      }

      // filter for specific owners if requested
      if (config.filterowners) {
        $.each(data.blocking, function (component) {
          if (!(component in OWNERS) || !(OWNERS[component] in config.filterowners))
            delete data.blocking[component];
        });
      }
    }
    )
  ).then(function() {
    refresh();
    $("body").fadeIn(400);
  });

  // Reload the data set if requested.
  if (config.reload) {
    setTimeout(update, config.reload * 1000);
  }
}

$(function () {
  update();
});

function dump(arr,level) {
	var dumped_text = "";
	if(!level) level = 0;
	
	//The padding given at the beginning of the line.
	var level_padding = "";
	for(var j=0;j<level+1;j++) level_padding += "    ";
	
	if(typeof(arr) == 'object') { //Array/Hashes/Objects 
		for(var item in arr) {
			var value = arr[item];
			
			if(typeof(value) == 'object') { //If it is an array,
				dumped_text += level_padding + "'" + item + "' ...\n";
				dumped_text += dump(value,level+1);
			} else {
				dumped_text += level_padding + "'" + item + "' => \"" + value + "\"\n";
			}
		}
	} else { //Stings/Chars/Numbers etc.
		dumped_text = "===>"+arr+"<===("+typeof(arr)+")";
	}
	return dumped_text;
}
