#include "http.hpp"

#include "log.hpp"

#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <csignal>
#include <fstream>
#include <netinet/in.h>
#include <sstream>
#include <sys/socket.h>
#include <unistd.h>

namespace {

std::string content_type_for(const std::string& path) {
    if (path.size() >= 5 && path.substr(path.size() - 5) == ".html") return "text/html; charset=utf-8";
    if (path.size() >= 3 && path.substr(path.size() - 3) == ".js") return "text/javascript; charset=utf-8";
    if (path.size() >= 4 && path.substr(path.size() - 4) == ".css") return "text/css; charset=utf-8";
    if (path.size() >= 5 && path.substr(path.size() - 5) == ".json") return "application/json";
    return "text/plain";
}

bool read_file(const std::string& path, std::string& out) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return false;
    std::ostringstream ss;
    ss << in.rdbuf();
    out = ss.str();
    return true;
}

bool recv_all_headers(int fd, std::string& raw) {
    char buf[4096];
    raw.clear();
    while (raw.find("\r\n\r\n") == std::string::npos) {
        ssize_t n = recv(fd, buf, sizeof(buf), 0);
        if (n <= 0) return false;
        raw.append(buf, static_cast<size_t>(n));
        if (raw.size() > 1024 * 1024) return false;
    }
    return true;
}

size_t header_end(const std::string& raw) { return raw.find("\r\n\r\n"); }

size_t content_length(const std::string& raw) {
    std::string lower = raw;
    for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    size_t p = lower.find("content-length:");
    if (p == std::string::npos) return 0;
    p += 15;
    while (p < lower.size() && lower[p] == ' ') ++p;
    return static_cast<size_t>(std::strtoul(lower.c_str() + p, nullptr, 10));
}

bool parse_request(const std::string& raw, HttpRequest& req) {
    size_t line_end = raw.find("\r\n");
    if (line_end == std::string::npos) return false;
    std::istringstream first(raw.substr(0, line_end));
    std::string ver;
    first >> req.method >> req.path >> ver;
    size_t q = req.path.find('?');
    if (q != std::string::npos) {
        req.query = req.path.substr(q + 1);
        req.path = req.path.substr(0, q);
    }
    size_t he = header_end(raw);
    req.body = raw.substr(he + 4);
    return true;
}

void send_response(int fd, const HttpResponse& res) {
    std::ostringstream os;
    os << "HTTP/1.1 " << res.status << " " << (res.status == 200 ? "OK" : "ERR") << "\r\n";
    os << "Content-Type: " << res.content_type << "\r\n";
    os << "Content-Length: " << res.body.size() << "\r\n";
    os << "Access-Control-Allow-Origin: *\r\n";
    os << "Access-Control-Allow-Headers: Content-Type\r\n";
    os << "Access-Control-Allow-Methods: GET,POST,OPTIONS\r\n";
    os << "Connection: close\r\n\r\n";
    std::string head = os.str();
    send(fd, head.data(), head.size(), 0);
    if (!res.body.empty()) send(fd, res.body.data(), res.body.size(), 0);
}

HttpResponse file_response(const std::string& web_dir, const std::string& url_path) {
    std::string rel = url_path == "/" ? "/index.html" : url_path;
    if (rel.find("..") != std::string::npos) {
        return {400, "text/plain", "bad path"};
    }
    std::string path = web_dir + rel;
    std::string body;
    if (!read_file(path, body)) return {404, "text/plain", "not found: " + rel};
    return {200, content_type_for(rel), body};
}

bool query_get(const std::string& query, const char* key, std::string& value) {
    std::string k = std::string(key) + "=";
    size_t p = 0;
    while (p < query.size()) {
        size_t amp = query.find('&', p);
        if (amp == std::string::npos) amp = query.size();
        std::string part = query.substr(p, amp - p);
        if (part.rfind(k, 0) == 0) {
            value = part.substr(k.size());
            return true;
        }
        p = amp + 1;
    }
    return false;
}

} // namespace

bool http_serve(int port, const std::string& web_dir, const HttpHandler& api) {
    std::signal(SIGPIPE, SIG_IGN);
    std::signal(SIGHUP, SIG_IGN);
    int server = socket(AF_INET, SOCK_STREAM, 0);
    if (server < 0) {
        LOG_ERROR("http: socket failed");
        return false;
    }
    int opt = 1;
    setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(static_cast<uint16_t>(port));
    if (bind(server, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        LOG_ERROR("http: bind %d failed", port);
        close(server);
        return false;
    }
    if (listen(server, 16) < 0) {
        LOG_ERROR("http: listen failed");
        close(server);
        return false;
    }
    LOG_INFO("http: listening on http://127.0.0.1:%d  web=%s", port, web_dir.c_str());

    while (true) {
        int fd = accept(server, nullptr, nullptr);
        if (fd < 0) continue;
        std::string raw;
        if (!recv_all_headers(fd, raw)) {
            close(fd);
            continue;
        }
        size_t he = header_end(raw);
        size_t want = content_length(raw);
        std::string body = raw.substr(he + 4);
        while (body.size() < want) {
            char buf[4096];
            ssize_t n = recv(fd, buf, sizeof(buf), 0);
            if (n <= 0) break;
            body.append(buf, static_cast<size_t>(n));
        }
        raw.resize(he + 4);
        raw += body;

        HttpRequest req;
        if (!parse_request(raw, req)) {
            send_response(fd, {400, "text/plain", "bad request"});
            close(fd);
            continue;
        }
        req.body = body;

        HttpResponse res;
        if (req.method == "OPTIONS") {
            res = {200, "text/plain", ""};
        } else if (req.path.rfind("/api/", 0) == 0) {
            res = api(req);
        } else {
            res = file_response(web_dir, req.path);
        }
        send_response(fd, res);
        close(fd);
    }
}

// silence unused warning in some builds
bool http_query_get(const std::string& query, const char* key, std::string& value) {
    return query_get(query, key, value);
}
