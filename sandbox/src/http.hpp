#pragma once

#include <functional>
#include <string>
#include <unordered_map>

struct HttpRequest {
    std::string method;
    std::string path;
    std::string query;
    std::string body;
};

struct HttpResponse {
    int status = 200;
    std::string content_type = "application/json";
    std::string body;
};

using HttpHandler = std::function<HttpResponse(const HttpRequest&)>;

// Blocking localhost server. Fine for a disposable alpha.
bool http_serve(int port, const std::string& web_dir, const HttpHandler& api);
bool http_query_get(const std::string& query, const char* key, std::string& value);
