#include "log.hpp"

#include <chrono>
#include <cstdio>
#include <ctime>
#include <iostream>

void Logger::open_file(const std::string& path) {
    std::lock_guard<std::mutex> lock(mu_);
    file_.open(path, std::ios::out | std::ios::app);
}

void Logger::set_level(LogLevel level) { level_ = level; }

static const char* level_name(LogLevel level) {
    switch (level) {
    case LogLevel::Debug:
        return "debug";
    case LogLevel::Info:
        return "info";
    case LogLevel::Warn:
        return "warn";
    case LogLevel::Error:
        return "error";
    }
    return "?";
}

void Logger::log(LogLevel level, const char* tag, const char* fmt, ...) {
    va_list args;
    va_start(args, fmt);
    vlog(level, tag, fmt, args);
    va_end(args);
}

void Logger::vlog(LogLevel level, const char* tag, const char* fmt, va_list args) {
    if (static_cast<int>(level) < static_cast<int>(level_)) return;

    char body[1024];
    vsnprintf(body, sizeof(body), fmt, args);

    using clock = std::chrono::system_clock;
    auto now = clock::now();
    std::time_t t = clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
    std::tm tm{};
    localtime_r(&t, &tm);
    char stamp[40];
    std::snprintf(stamp, sizeof(stamp), "%04d-%02d-%02d %02d:%02d:%02d.%03d", tm.tm_year + 1900,
                  tm.tm_mon + 1, tm.tm_mday, tm.tm_hour, tm.tm_min, tm.tm_sec,
                  static_cast<int>(ms.count()));

    char line[1200];
    std::snprintf(line, sizeof(line), "[%s] [%s] [%s] %s\n", stamp, level_name(level), tag, body);

    std::lock_guard<std::mutex> lock(mu_);
    std::fputs(line, level == LogLevel::Error ? stderr : stdout);
    std::fflush(level == LogLevel::Error ? stderr : stdout);
    if (file_.is_open()) {
        file_ << line;
        file_.flush();
    }
}

Logger& log_get() {
    static Logger logger;
    return logger;
}
