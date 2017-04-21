
backend be_diff_service {
  .dynamic = true;
  .port = "443";
  .host = "us-central1-rd---product.cloudfunctions.net";
  .ssl_sni_hostname = "us-central1-rd---product.cloudfunctions.net";
  .ssl_cert_hostname = "us-central1-rd---product.cloudfunctions.net";
  .ssl = true;
  .probe = {
    .timeout = 10s;
    .interval = 10s;
    .request = "GET /healthcheck HTTP/1.1" "Host: us-central1-rd---product.cloudfunctions.net" "Connection: close" "User-Agent: Fastly healthcheck";
  }
}

backend be_registry {
  .dynamic = true;
  .port = "80";
  .host = "registry.npmjs.org";
  .ssl = false;
  .probe = {
    .request = "GET / HTTP/1.1" "Host: registry.npmjs.org" "Connection: close" "User-Agent: Fastly healthcheck";
  }
}


sub vcl_recv {
#FASTLY recv

  declare local var.diffUrlPrefix STRING;
  declare local var.diffUrlSuffix STRING;

  if (req.request != "HEAD" && req.request != "GET" && req.request != "FASTLYPURGE") {
    return(pass);
  }

  if (req.url == "/healthcheck") {
    error 801;
  }

  if (req.url ~ "^(/.*\/\-\/.*)\-(\d+\.\d+\.\d+)...(\d+\.\d+\.\d+)(\.tgz)\.patch") {
    set var.diffUrlPrefix = if (req.http.Fastly-SSL, "https://", "http://") req.http.Host ".global.prod.fastly.net" re.group.1 "-";
    set var.diffUrlSuffix = re.group.4;
    set req.backend = be_diff_service;
    set req.http.Host = "us-central1-rd---product.cloudfunctions.net";
    set req.http.Backend-Name = "diff";
    set req.url = "/compareURLs?from=" var.diffUrlPrefix re.group.2 var.diffUrlSuffix "&to=" var.diffUrlPrefix re.group.3 var.diffUrlSuffix;
  } else {
    set req.backend = be_registry;
    set req.http.Host = "registry.npmjs.org";
    set req.http.Backend-Name = "registry";
  }

  return(lookup);
}

sub vcl_fetch {
#FASTLY fetch

  if ((beresp.status == 500 || beresp.status == 503) && req.restarts < 1 && (req.request == "GET" || req.request == "HEAD")) {
    restart;
  }

  if (req.restarts > 0) {
    set beresp.http.Fastly-Restarts = req.restarts;
  }

  if (beresp.http.Set-Cookie) {
    set req.http.Fastly-Cachetype = "SETCOOKIE";
    return(pass);
  }

  if (beresp.http.Cache-Control ~ "private") {
    set req.http.Fastly-Cachetype = "PRIVATE";
    return(pass);
  }

  if (beresp.status == 500 || beresp.status == 503) {
    set req.http.Fastly-Cachetype = "ERROR";
    set beresp.ttl = 1s;
    set beresp.grace = 5s;
    return(deliver);
  }

  set beresp.http.Backend-Name = req.http.Backend-Name;

  if (beresp.http.Expires || beresp.http.Surrogate-Control ~ "max-age" || beresp.http.Cache-Control ~ "(s-maxage|max-age)") {
    # keep the ttl here
  } else {
    # apply the default ttl
    set beresp.ttl = 3600s;
  }

  return(deliver);
}

sub vcl_hit {
#FASTLY hit

  if (!obj.cacheable) {
    return(pass);
  }
  return(deliver);
}

sub vcl_miss {
#FASTLY miss
  return(fetch);
}

sub vcl_deliver {
#FASTLY deliver
  return(deliver);
}

sub vcl_error {
  #FASTLY error
  if (obj.status == 801) {
    set obj.status = 200;
    set obj.response = "OK";
    synthetic {"CDN OK"};
  }
}

sub vcl_pass {
#FASTLY pass
}

sub vcl_log {
#FASTLY log
}
