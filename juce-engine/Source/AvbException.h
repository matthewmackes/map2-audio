/*
 * AvbException.h - AVB-specific exception types
 *
 * These exceptions are thrown only during initialization/cleanup, never in RT threads.
 * Used for capability checks, socket creation failures, and configuration errors.
 */

#pragma once

#include <stdexcept>
#include <string>

namespace Map2Audio {

/**
 * Base exception for all AVB-related errors.
 * These are thrown during initialization only - never in real-time context.
 */
class AvbException : public std::runtime_error {
public:
    explicit AvbException(const std::string& message)
        : std::runtime_error(message) {}
};

/**
 * Thrown when CAP_NET_RAW capability is not available.
 * AF_PACKET sockets require this capability for raw Ethernet access.
 */
class AvbCapabilityException : public AvbException {
public:
    explicit AvbCapabilityException(const std::string& message)
        : AvbException("CAP_NET_RAW capability required: " + message) {}
};

/**
 * Thrown when socket operations fail (creation, binding, configuration).
 */
class AvbSocketException : public AvbException {
public:
    explicit AvbSocketException(const std::string& message)
        : AvbException("Socket error: " + message) {}
};

/**
 * Thrown when AVB configuration is invalid.
 */
class AvbConfigException : public AvbException {
public:
    explicit AvbConfigException(const std::string& message)
        : AvbException("Configuration error: " + message) {}
};

/**
 * Thrown when hardware timestamping is not available or fails.
 */
class AvbTimestampException : public AvbException {
public:
    explicit AvbTimestampException(const std::string& message)
        : AvbException("Timestamp error: " + message) {}
};

} // namespace Map2Audio
