#pragma once

#include <cstdarg>
#include <fstream>
#include <mutex>
#include <string>

enum class LogLevel { Debug, Info, Warn, Error };

class Logger {
public:
    void open_file(const std::string& path);
    void set_level(LogLevel level);
    void log(LogLevel level, const char* tag, const char* fmt, ...);
    void vlog(LogLevel level, const char* tag, const char* fmt, va_list args);

private:
    std::mutex mu_;
    std::ofstream file_;
    LogLevel level_ = LogLevel::Info;
};

Logger& log_get();

#define LOG_DEBUG(...) log_get().log(LogLevel::Debug, "dbg", __VA_ARGS__)
#define LOG_INFO(...) log_get().log(LogLevel::Info, "info", __VA_ARGS__)
#define LOG_WARN(...) log_get().log(LogLevel::Warn, "warn", __VA_ARGS__)
#define LOG_ERROR(...) log_get().log(LogLevel::Error, "err", __VA_ARGS__)
