# frozen_string_literal: true

require_relative 'boot'

require 'rails'
require 'active_model/railtie'
require 'active_record/railtie'
require 'action_controller/railtie'

require_relative '../app/middlewares/application_middleware'
require_relative '../app/middlewares/tenant_resolver_middleware'

Bundler.require(*Rails.groups)

module AiInterview
  class Application < Rails::Application
    config.load_defaults 7.0

    # API-only mode
    config.api_only = true

    # Auto-load paths
    config.autoload_paths += %W[
    ]

    # Use UUID primary keys by default
    config.generators do |g|
      g.orm :active_record, primary_key_type: :uuid
    end

    config.middleware.use Rack::Attack
    config.middleware.use TenantResolverMiddleware
  end
end
