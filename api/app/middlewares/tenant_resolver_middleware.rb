# frozen_string_literal: true

class TenantResolverMiddleware < ApplicationMiddleware
  def call(env)
    request = ActionDispatch::Request.new(env)

    scheme = resolve_scheme(request)
    organization = find_organization(scheme)

    if organization
      Current.organization = organization
      Current.tenant_id    = organization.id
    end

    super
  end

  private

  def resolve_scheme(request)
    # 1. Try JWT bearer token first
    scheme_from_jwt(request) ||
      # 2. Try explicit header
      request.headers['X-Tenant-Scheme'].presence ||
      # 3. Fall back to referer host
      scheme_from_referer(request)
  end

  def scheme_from_jwt(request)
    auth_header = request.headers['Authorization'].to_s
    return unless auth_header.start_with?('Bearer ', 'bearer ')

    token = auth_header.split(' ').last
    claims = JsonWebToken.decode_without_verification(token)
    claims[:scheme].presence
  rescue StandardError
    nil
  end

  def scheme_from_referer(request)
    referer = request.referer.to_s
    return if referer.blank?

    host = URI.parse(referer).host.to_s
    host.presence
  rescue URI::InvalidURIError
    nil
  end

  def find_organization(scheme)
    return if scheme.blank?

    Organization.identify(scheme)
  rescue StandardError
    nil
  end
end
