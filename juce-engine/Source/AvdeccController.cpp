/*
 * AvdeccController.cpp
 * Implements Map2AvdeccController using la_avdecc v4.x controller API.
 *
 * Key design choices:
 *  - Entity cache (entityCache_) is populated by the observer's onEntityOnline
 *    callback, which la_avdecc only fires after full AEM enumeration. So all
 *    entities in the cache already have their complete model available.
 *  - Async la_avdecc commands (connectStream, setStreamFormat, etc.) are
 *    bridged to synchronous returns via std::promise / std::future.
 *  - getEntityModelJson() traverses the entity tree via a locked guard and
 *    builds a JSON string compatible with what aem_cache.py stores.
 */

#ifdef HAS_AVDECC

#include "AvdeccController.h"

#include <la/avdecc/controller/avdeccController.hpp>
#include <la/avdecc/internals/entityModelTreeDynamic.hpp>
#include <la/avdecc/internals/entityModelTreeStatic.hpp>
#include <la/avdecc/internals/entityModelTreeCommon.hpp>

#include <iostream>
#include <sstream>
#include <iomanip>
#include <stdexcept>

namespace Map2Audio {

// ── Helpers ───────────────────────────────────────────────────────────────────

static std::string hexStr(uint64_t v)
{
    std::ostringstream ss;
    ss << "0x" << std::hex << std::uppercase << std::setw(16)
       << std::setfill('0') << v;
    return ss.str();
}

static std::string escapeJson(const std::string& s)
{
    std::string out;
    out.reserve(s.size() + 4);
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:   out += c;
        }
    }
    return out;
}

// ── Constructor / Destructor ──────────────────────────────────────────────────

Map2AvdeccController::Map2AvdeccController(const std::string& interfaceName,
                                           const std::string& entityName,
                                           uint16_t talkerStreams,
                                           uint16_t listenerStreams)
    : interfaceName_(interfaceName)
    , entityName_(entityName)
    , talkerStreams_(talkerStreams)
    , listenerStreams_(listenerStreams)
{
}

Map2AvdeccController::~Map2AvdeccController()
{
    stop();
}

// ── start / stop ──────────────────────────────────────────────────────────────

bool Map2AvdeccController::start()
{
    if (running_) return true;

    try {
        controller_ = la::avdecc::controller::Controller::create(
            la::avdecc::protocol::ProtocolInterface::Type::PCap,
            interfaceName_,
            /*progID=*/1u,
            /*entityModelID=*/la::avdecc::UniqueIdentifier{},
            /*preferedLocale=*/"en",
            /*entityModelTree=*/nullptr,
            /*executorName=*/std::nullopt,
            /*virtualEntityInterface=*/nullptr);

        controller_->registerObserver(this);

        // Enable automatic periodic re-discovery (every 10 s)
        controller_->setAutomaticDiscoveryDelay(std::chrono::milliseconds{ 10000 });

        running_ = true;
        std::cout << "[AVDECC] Controller started on " << interfaceName_ << std::endl;
        return true;

    } catch (la::avdecc::controller::Controller::Exception const& e) {
        std::cerr << "[AVDECC] Controller creation failed: "
                  << e.what() << std::endl;
        controller_ = { nullptr, nullptr };
        return false;
    } catch (std::exception const& e) {
        std::cerr << "[AVDECC] Unexpected error during start: "
                  << e.what() << std::endl;
        controller_ = { nullptr, nullptr };
        return false;
    }
}

void Map2AvdeccController::stop()
{
    if (!running_) return;

    running_ = false;

    if (controller_) {
        controller_->unregisterObserver(this);
        // la_avdecc controller RAII-destroys on reset
        controller_ = { nullptr, nullptr };
    }

    std::lock_guard<std::mutex> lk(mutex_);
    entityCache_.clear();
    connectionCache_.clear();

    std::cout << "[AVDECC] Controller stopped" << std::endl;
}

// ── Observer callbacks ────────────────────────────────────────────────────────

void Map2AvdeccController::onEntityOnline(
    la::avdecc::controller::Controller const* const /*controller*/,
    la::avdecc::controller::ControlledEntity const* const entity) noexcept
{
    if (!entity) return;

    try {
        auto discovered = buildDiscoveredEntity(*entity);
        std::lock_guard<std::mutex> lk(mutex_);
        entityCache_[discovered.entity_id] = std::move(discovered);
    } catch (...) {}
}

void Map2AvdeccController::onEntityOffline(
    la::avdecc::controller::Controller const* const /*controller*/,
    la::avdecc::controller::ControlledEntity const* const entity) noexcept
{
    if (!entity) return;

    try {
        uint64_t eid = entity->getEntity().getEntityID().getValue();
        std::lock_guard<std::mutex> lk(mutex_);

        // Mark as unavailable (don't erase — Python may still read it)
        auto it = entityCache_.find(eid);
        if (it != entityCache_.end()) {
            it->second.available = false;
        }

        // Remove connections involving this entity
        connectionCache_.erase(
            std::remove_if(connectionCache_.begin(), connectionCache_.end(),
                [eid](const AvdeccConnection& c) {
                    return c.talker_entity_id == eid
                        || c.listener_entity_id == eid;
                }),
            connectionCache_.end());
    } catch (...) {}
}

void Map2AvdeccController::onStreamInputConnectionChanged(
    la::avdecc::controller::Controller const* const /*controller*/,
    la::avdecc::controller::ControlledEntity const* const entity,
    la::avdecc::entity::model::StreamIndex const streamIndex,
    la::avdecc::entity::model::StreamInputConnectionInfo const& info,
    bool const /*changedByOther*/) noexcept
{
    if (!entity) return;

    try {
        uint64_t listenerEid = entity->getEntity().getEntityID().getValue();
        std::lock_guard<std::mutex> lk(mutex_);

        // Remove existing entry for this listener stream
        connectionCache_.erase(
            std::remove_if(connectionCache_.begin(), connectionCache_.end(),
                [listenerEid, streamIndex](const AvdeccConnection& c) {
                    return c.listener_entity_id == listenerEid
                        && c.listener_unique_id == streamIndex;
                }),
            connectionCache_.end());

        using State = la::avdecc::entity::model::StreamInputConnectionInfo::State;
        if (info.state == State::Connected || info.state == State::FastConnecting) {
            AvdeccConnection conn;
            conn.talker_entity_id  = info.talkerStream.entityID.getValue();
            conn.talker_unique_id  = info.talkerStream.streamIndex;
            conn.listener_entity_id = listenerEid;
            conn.listener_unique_id = static_cast<uint16_t>(streamIndex);
            conn.connected = (info.state == State::Connected);
            connectionCache_.push_back(conn);
        }
    } catch (...) {}
}

// ── buildDiscoveredEntity ─────────────────────────────────────────────────────

DiscoveredEntity Map2AvdeccController::buildDiscoveredEntity(
    la::avdecc::controller::ControlledEntity const& entity) const noexcept
{
    DiscoveredEntity d;
    try {
        auto const& e = entity.getEntity();

        d.entity_id       = e.getEntityID().getValue();
        d.entity_model_id = e.getEntityModelID().getValue();

        // Vendor / model IDs derived from entity_model_id (IEEE 1722.1 layout)
        // entity_model_id bits 63-40 = OUI-24 (vendor), bits 39-0 = model
        // (same extraction as avdeccEntityToDict in PythonBindings.cpp)

        d.talker_stream_sources  = e.getTalkerStreamSources();
        d.listener_stream_sinks  = e.getListenerStreamSinks();

        // Capabilities (raw bit fields from Entity)
        auto talkerCaps   = e.getTalkerCapabilities();
        auto listenerCaps = e.getListenerCapabilities();
        d.talker_capabilities   = static_cast<uint16_t>(talkerCaps.value());
        d.listener_capabilities = static_cast<uint16_t>(listenerCaps.value());

        // MAC address & gPTP from the first interface we find
        auto const& ifaces = e.getInterfacesInformation();
        if (!ifaces.empty()) {
            auto const& ifInfo = ifaces.begin()->second;
            auto const& mac = ifInfo.macAddress;
            std::copy(mac.begin(), mac.end(), d.mac_address.begin());

            if (ifInfo.gptpGrandmasterID.has_value())
                d.gptp_grandmaster_id = ifInfo.gptpGrandmasterID->getValue();
            if (ifInfo.gptpDomainNumber.has_value())
                d.gptp_domain_number = *ifInfo.gptpDomainNumber;
        }

        d.available = true;
        d.has_model = true; // onEntityOnline fires only after full enumeration

        // Entity name, firmware, group, serial from AEM entity node
        if (entity.hasAnyConfiguration()) {
            auto const& entityNode = entity.getEntityNode();
            d.entity_name      = entityNode.dynamicModel.entityName.str();
            d.firmware_version = entityNode.dynamicModel.firmwareVersion.str();
            d.group_name       = entityNode.dynamicModel.groupName.str();
            d.serial_number    = entityNode.dynamicModel.serialNumber.str();
        }

    } catch (...) {
        // Return whatever we filled in so far
    }
    return d;
}

// ── buildEntityModelJson ──────────────────────────────────────────────────────

std::string Map2AvdeccController::buildEntityModelJson(
    la::avdecc::UniqueIdentifier entityID) const noexcept
{
    try {
        if (!controller_) return "";

        auto guard = controller_->getControlledEntityGuard(entityID);
        if (!guard) return "";

        auto const& entity = *guard;
        if (!entity.hasAnyConfiguration()) return "";

        auto const& entityNode = entity.getEntityNode();
        auto const& e          = entity.getEntity();

        std::ostringstream json;
        json << "{";

        // ── entity descriptor ────────────────────────────────────────────────
        json << "\"entity\":{"
             << "\"entity_id\":"        << "\"" << hexStr(e.getEntityID().getValue())       << "\","
             << "\"entity_model_id\":"  << "\"" << hexStr(e.getEntityModelID().getValue())  << "\","
             << "\"entity_name\":\""    << escapeJson(entityNode.dynamicModel.entityName.str())      << "\","
             << "\"firmware_version\":\""<< escapeJson(entityNode.dynamicModel.firmwareVersion.str())<< "\","
             << "\"group_name\":\""     << escapeJson(entityNode.dynamicModel.groupName.str())       << "\","
             << "\"serial_number\":\""  << escapeJson(entityNode.dynamicModel.serialNumber.str())    << "\""
             << "}";

        // ── configurations ───────────────────────────────────────────────────
        json << ",\"configurations\":[";

        bool firstConfig = true;
        for (auto const& [cfgIdx, cfgNode] : entityNode.configurations) {
            if (!firstConfig) json << ",";
            firstConfig = false;

            json << "{\"index\":" << cfgIdx;

            // stream_inputs
            json << ",\"stream_inputs\":[";
            bool first = true;
            for (auto const& [streamIdx, streamNode] : cfgNode.streamInputs) {
                if (!first) json << ",";
                first = false;
                uint64_t fmt = streamNode.dynamicModel.streamFormat.getValue();
                json << "{"
                     << "\"index\":"         << streamIdx << ","
                     << "\"current_format\":" << fmt
                     << "}";
            }
            json << "]";

            // stream_outputs
            json << ",\"stream_outputs\":[";
            first = true;
            for (auto const& [streamIdx, streamNode] : cfgNode.streamOutputs) {
                if (!first) json << ",";
                first = false;
                uint64_t fmt = streamNode.dynamicModel.streamFormat.getValue();
                json << "{"
                     << "\"index\":"         << streamIdx << ","
                     << "\"current_format\":" << fmt
                     << "}";
            }
            json << "]";

            json << "}";
        }
        json << "]";

        json << "}";
        return json.str();

    } catch (...) {
        return "";
    }
}

// ── Public interface ──────────────────────────────────────────────────────────

std::vector<DiscoveredEntity> Map2AvdeccController::getDiscoveredEntities() const
{
    std::lock_guard<std::mutex> lk(mutex_);
    std::vector<DiscoveredEntity> out;
    out.reserve(entityCache_.size());
    for (auto const& [id, ent] : entityCache_) {
        out.push_back(ent);
    }
    return out;
}

std::optional<std::string> Map2AvdeccController::getEntityModelJson(uint64_t entityId) const
{
    if (!controller_ || !running_) return std::nullopt;

    auto json = buildEntityModelJson(la::avdecc::UniqueIdentifier{ entityId });
    if (json.empty()) return std::nullopt;
    return json;
}

bool Map2AvdeccController::connectStream(
    uint64_t talkerEntityId, uint16_t talkerStreamIndex,
    uint64_t listenerEntityId, uint16_t listenerStreamIndex)
{
    if (!controller_ || !running_) return false;

    std::promise<bool> promise;
    auto future = promise.get_future();

    la::avdecc::entity::model::StreamIdentification talker{
        la::avdecc::UniqueIdentifier{ talkerEntityId },
        static_cast<la::avdecc::entity::model::StreamIndex>(talkerStreamIndex)
    };
    la::avdecc::entity::model::StreamIdentification listener{
        la::avdecc::UniqueIdentifier{ listenerEntityId },
        static_cast<la::avdecc::entity::model::StreamIndex>(listenerStreamIndex)
    };

    controller_->connectStream(talker, listener,
        [&promise](la::avdecc::controller::ControlledEntity const* const /*talkerEnt*/,
                   la::avdecc::controller::ControlledEntity const* const /*listenerEnt*/,
                   la::avdecc::entity::model::StreamIndex const /*talkerIdx*/,
                   la::avdecc::entity::model::StreamIndex const /*listenerIdx*/,
                   la::avdecc::entity::ControllerEntity::ControlStatus const status)
        {
            promise.set_value(
                status == la::avdecc::entity::ControllerEntity::ControlStatus::Success);
        });

    if (future.wait_for(std::chrono::seconds(5)) == std::future_status::timeout)
        return false;
    return future.get();
}

bool Map2AvdeccController::disconnectStream(
    uint64_t talkerEntityId, uint16_t talkerStreamIndex,
    uint64_t listenerEntityId, uint16_t listenerStreamIndex)
{
    if (!controller_ || !running_) return false;

    std::promise<bool> promise;
    auto future = promise.get_future();

    la::avdecc::entity::model::StreamIdentification talker{
        la::avdecc::UniqueIdentifier{ talkerEntityId },
        static_cast<la::avdecc::entity::model::StreamIndex>(talkerStreamIndex)
    };
    la::avdecc::entity::model::StreamIdentification listener{
        la::avdecc::UniqueIdentifier{ listenerEntityId },
        static_cast<la::avdecc::entity::model::StreamIndex>(listenerStreamIndex)
    };

    controller_->disconnectStream(talker, listener,
        [&promise](la::avdecc::controller::ControlledEntity const* const /*listenerEnt*/,
                   la::avdecc::entity::model::StreamIndex const /*listenerIdx*/,
                   la::avdecc::entity::ControllerEntity::ControlStatus const status)
        {
            promise.set_value(
                status == la::avdecc::entity::ControllerEntity::ControlStatus::Success);
        });

    if (future.wait_for(std::chrono::seconds(5)) == std::future_status::timeout)
        return false;
    return future.get();
}

std::vector<AvdeccConnection> Map2AvdeccController::getActiveConnections() const
{
    std::lock_guard<std::mutex> lk(mutex_);
    return connectionCache_;
}

StreamFormatOperationResult Map2AvdeccController::getStreamFormat(
    uint64_t entityId,
    Avdecc::DescriptorType descriptorType,
    uint16_t streamIndex,
    uint16_t configurationIndex,
    int /*timeoutMs*/)
{
    StreamFormatOperationResult result;

    if (!controller_ || !running_) {
        result.message = "avdecc_unavailable";
        return result;
    }

    try {
        auto guard = controller_->getControlledEntityGuard(
            la::avdecc::UniqueIdentifier{ entityId });

        if (!guard) {
            result.status  = AecpAemStatus::NO_SUCH_DESCRIPTOR;
            result.message = "entity_not_found";
            return result;
        }

        auto const& entity = *guard;
        if (!entity.hasAnyConfiguration()) {
            result.status  = AecpAemStatus::NOT_SUPPORTED;
            result.message = "no_aem";
            return result;
        }

        auto cfgIdx = static_cast<la::avdecc::entity::model::ConfigurationIndex>(
            configurationIndex);
        auto streamIdx = static_cast<la::avdecc::entity::model::StreamIndex>(
            streamIndex);

        uint64_t fmt = 0;
        if (descriptorType == Avdecc::DescriptorType::STREAM_INPUT) {
            auto const& node = entity.getStreamInputNode(cfgIdx, streamIdx);
            fmt = node.dynamicModel.streamFormat.getValue();
        } else {
            auto const& node = entity.getStreamOutputNode(cfgIdx, streamIdx);
            fmt = node.dynamicModel.streamFormat.getValue();
        }

        result.success      = true;
        result.status       = AecpAemStatus::SUCCESS;
        result.stream_format = fmt;
        result.message      = "ok";

    } catch (std::exception const& e) {
        result.status  = AecpAemStatus::NO_SUCH_DESCRIPTOR;
        result.message = e.what();
    }

    return result;
}

StreamFormatOperationResult Map2AvdeccController::setStreamFormat(
    uint64_t entityId,
    Avdecc::DescriptorType descriptorType,
    uint16_t streamIndex,
    uint64_t format,
    uint16_t /*configurationIndex*/,
    int timeoutMs)
{
    StreamFormatOperationResult result;
    result.stream_format = format;

    if (!controller_ || !running_) {
        result.message = "avdecc_unavailable";
        return result;
    }

    std::promise<la::avdecc::entity::ControllerEntity::AemCommandStatus> promise;
    auto future = promise.get_future();

    la::avdecc::UniqueIdentifier eid{ entityId };
    auto streamIdx = static_cast<la::avdecc::entity::model::StreamIndex>(streamIndex);
    la::avdecc::entity::model::StreamFormat streamFmt{ format };

    auto handler = [&promise](
        la::avdecc::controller::ControlledEntity const* const /*entity*/,
        la::avdecc::entity::ControllerEntity::AemCommandStatus const status)
    {
        promise.set_value(status);
    };

    if (descriptorType == Avdecc::DescriptorType::STREAM_INPUT) {
        controller_->setStreamInputFormat(eid, streamIdx, streamFmt, handler);
    } else {
        controller_->setStreamOutputFormat(eid, streamIdx, streamFmt, handler);
    }

    auto timeout = std::chrono::milliseconds{ timeoutMs };
    if (future.wait_for(timeout) == std::future_status::timeout) {
        result.status  = AecpAemStatus::IN_PROGRESS;
        result.message = "timeout";
        return result;
    }

    auto status = future.get();
    using S = la::avdecc::entity::ControllerEntity::AemCommandStatus;

    if (status == S::Success) {
        result.success = true;
        result.status  = AecpAemStatus::SUCCESS;
        result.message = "ok";
    } else {
        result.status  = AecpAemStatus::NOT_SUPPORTED;
        result.message = juce::String::formatted("aecp_status_%d",
                             static_cast<int>(status));
    }

    return result;
}

} // namespace Map2Audio

#endif // HAS_AVDECC
