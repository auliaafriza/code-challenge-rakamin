# frozen_string_literal: true

require_relative '../../app/channels/audio_websocket_middleware'
require_relative '../../app/channels/coverage_websocket_middleware'

Rails.application.config.middleware.insert_before TenantResolverMiddleware, AudioWebSocketMiddleware
Rails.application.config.middleware.insert_before TenantResolverMiddleware, CoverageWebSocketMiddleware
