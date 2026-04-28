// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// IpcMidiBridge implementation.
// Worklist: T2459-H1

#include "IpcMidiBridge.h"

namespace map2::midi_bridge {

IpcMidiBridge::IpcMidiBridge() = default;
IpcMidiBridge::~IpcMidiBridge() = default;

bool IpcMidiBridge::openConsumer()
{
    rtRing_      = std::make_unique<ShmEventRing>();
    controlRing_ = std::make_unique<ShmEventRing>();

    // capacity=0 in OpenExisting mode is fine — it's read from the header.
    if (! rtRing_->open (ShmEventRing::kRtRingShmName, 0, ShmEventRing::Mode::OpenExisting))
    {
        errorMessage_ = std::string ("RT ring open failed: ") + rtRing_->errorMessage();
        rtRing_.reset();
        controlRing_.reset();
        return false;
    }
    if (! controlRing_->open (ShmEventRing::kControlRingShmName, 0, ShmEventRing::Mode::OpenExisting))
    {
        errorMessage_ = std::string ("Control ring open failed: ") + controlRing_->errorMessage();
        rtRing_.reset();
        controlRing_.reset();
        return false;
    }
    errorMessage_.clear();
    return true;
}

std::size_t IpcMidiBridge::pollRt (std::size_t maxEvents, const RtEventCallback& cb)
{
    if (rtRing_ == nullptr || ! rtRing_->isOpen() || ! cb)
        return 0;
    std::uint8_t buf[kMaxPayloadBytes];
    std::size_t drained = 0;
    for (std::size_t i = 0; i < maxEvents; ++i)
    {
        std::uint64_t ts = 0;
        const std::size_t got = rtRing_->pop (&ts, buf, sizeof (buf));
        if (got == 0) break;
        cb (ts, buf, got);
        ++drained;
    }
    return drained;
}

std::size_t IpcMidiBridge::pollControl (std::size_t maxEvents, const RtEventCallback& cb)
{
    if (controlRing_ == nullptr || ! controlRing_->isOpen() || ! cb)
        return 0;
    std::uint8_t buf[kMaxPayloadBytes];
    std::size_t drained = 0;
    for (std::size_t i = 0; i < maxEvents; ++i)
    {
        std::uint64_t ts = 0;
        const std::size_t got = controlRing_->pop (&ts, buf, sizeof (buf));
        if (got == 0) break;
        cb (ts, buf, got);
        ++drained;
    }
    return drained;
}

std::uint64_t IpcMidiBridge::rtDroppedCount() const noexcept
{
    return rtRing_ ? rtRing_->droppedCount() : 0;
}

std::uint64_t IpcMidiBridge::controlDroppedCount() const noexcept
{
    return controlRing_ ? controlRing_->droppedCount() : 0;
}

bool IpcMidiBridge::isOpen() const noexcept
{
    return rtRing_ && rtRing_->isOpen()
        && controlRing_ && controlRing_->isOpen();
}

} // namespace map2::midi_bridge
