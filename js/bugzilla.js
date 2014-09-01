/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

var _callbacks = [];

function process(data) {
  var id = data.id;
  var cb = _callbacks[id];
  delete _callbacks[id];
  cb(data.error, data.result);
}

var query = (function () {
  var gen = 0;
  return function (method, params) {
    return $.Deferred(function (deferred) {
      _callbacks[gen] = function (error, result) {
        if (error)
          deferred.reject(error);
        else
          deferred.resolve(result);
      };
      var request = {
        method: method,
        id: (gen++),
        callback: "process"
      };
      if (params) {
        request.params = JSON.stringify(params);
      }
      var args = [];
      $.each(request, function (field, value) {
        args.push(encodeURIComponent(field) + "=" + encodeURIComponent(value));
      });
      var script = document.createElement('script');
      script.type = "text/javascript";
      script.src = "https://bugzilla.mozilla.org/jsonrpc.cgi?" + args.join("&");
      script.defer = true;
      document.head.appendChild(script);
    });
  };
})();

// Ensure that a property exists.
function ensure(obj, prop, dflt) {
  if (!(prop in obj))
    obj[prop] = dflt;
  return obj[prop];
}

// Increment a counter.
function inc(obj, prop) {
  ensure(obj, prop, 0);
  obj[prop]++;
}

// Accumulate values in a set.
function accumulate(v, filter) {
  var sum = 0;
  $.each(v, function (key, value) {
    if (typeof value === "object") {
      sum += accumulate(value, (!filter || key === filter) ? "" : filter);
      return;
    }
    if (!filter || key === filter)
      sum += value;
  });
  return sum;
}

// Append a string to every string in the array.
function suffix(list, suffix) {
  var result = [];
  $.each(list, function (_, prefix) {
    result.push(prefix + suffix);
  });
  return result;
}

// Iterate over properties of an object in alphabetical order.
function eachAlphabetically(obj, cb) {
  $.each(Object.getOwnPropertyNames(obj).sort(), function (n, prop) {
    cb(prop, obj[prop]);
  });
}

function Filter() {
}

Filter.prototype = {
  // filter all open bugs
  open: function () {
    this.status = ["UNCONFIRMED","NEW","ASSIGNED","REOPENED"];
    return this;
  },
  // filter all closed bugs
  closed: function () {
    this.status = ["RESOLVED","VERIFIED"];
    return this;
  },
  // filter all bugs that block a specific B2G version
  blocking: function (release) {
    this.cf_blocking_b2g = release;
    return this;
  },
  // filter all bugs that have feature-b2g
  feature: function (release) {
    this.cf_feature_b2g = release;
    return this;
  },
  // limit to specific fields
  limit: function (fields) {
    this.include_fields = fields;
    return this;
  }
};

// Return a filter that includes all bugs.
function all() {
  return new Filter();
}

// Search for bugs match the constraints in filter.
function search(filter) {
  return query("Bug.search", [filter]).then(function (result) {
    return result.bugs;
  });
}

// Count the number of bugs matching the constraints in filter.
function count(filter, cb) {
  search(filter.limit()).then(function (bugs) {
    return bugs.length;
  });
}

// Group results by a specific field.
function group(filter, fields, cb) {
  if (typeof fields === "string")
    fields = [fields];
  return search(filter.limit(fields)).then(function (bugs) {
    var counts = {};
    $.each(bugs, function (_, bug) {
      var ptr = counts;
      var last = fields[fields.length - 1];
      $.each(fields, function (_, field) {
        if (field === last)
          return;
        ptr = ensure(ptr, bug[field], {});
      });
      inc(ptr, bug[last]);
    });
    return counts;
  });
}

// Slice an array into chunks of size 'chunkSize'
function chunk(array, chunkSize) {
  return [].concat.apply([],
                         array.map(function (e, i) {
                           return i % chunkSize ? [] : [array.slice(i, i + chunkSize)];
                         }));
}

// Get history for a set of bugs.
function history(bugs) {
  var total = [];
  return $.when.apply($, chunk(bugs, 400).map(function (chunk) {
    return query("Bug.history", [{ids: chunk}]).then(function (more) {
      total = total.concat(more.bugs);
    });
  })).then(function () {
    return total;
  });
}
