/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

function parseQueryString(cb) {
  var parts = window.location.href.split("?");
  if (parts.length > 1) {
    parts = parts[1].split("&");
    $.each(parts, function (_, param) {
      param = param.split("=");
      if (param.length < 2)
        return;
      var value = decodeURIComponent(param[1]);
      cb(param[0],
         value,
         value | 0,
         (value === "yes" || value === "true" || value === 1),
         value.split(","));
    });
  }
}
