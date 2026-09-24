# frozen_string_literal: true

require 'spec_helper'
ENV['RAILS_ENV'] ||= 'test'
require_relative '../config/environment'

abort('The Rails environment is running in production mode!') if Rails.env.production?

require 'rspec/rails'

module TenantSpecHelper
  def with_tenant(organization)
    RequestStore.store[:organization] = organization
    RequestStore.store[:tenant_id]    = organization.id
    yield
  ensure
    RequestStore.clear!
  end

  def as_user(user_id:, role: 'admin', scheme: 'test-corp')
    RequestStore.store[:user] = OpenStruct.new(id: user_id, role: role, scheme: scheme)
    yield
  ensure
    RequestStore.store.delete(:user)
  end

  def auth_headers(user_id: 1, role: 'admin', scheme: 'test-corp')
    token = JsonWebToken.encode({ user_id: user_id, role: role, scheme: scheme })
    { 'Authorization' => "Bearer #{token}", 'X-Tenant-Scheme' => scheme }
  end
end

RSpec.configure do |config|
  config.use_transactional_fixtures = true
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!

  config.include TenantSpecHelper

  config.after do
    RequestStore.clear!
  end
end
