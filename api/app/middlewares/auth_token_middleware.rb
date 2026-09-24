# frozen_string_literal: true

class AuthTokenMiddleware < ApplicationMiddleware
  def initialize(app, *roles)
    super(app)
    @required_roles = roles.flatten.map(&:to_s)
  end

  def call(env)
    request = ActionDispatch::Request.new(env)

    result = capture_error do
      AuthorizeApiRequest.new(request.headers, @required_roles).call
    end

    if @error
      return error(*@error) unless @required_roles.empty?
    end

    if result
      Current.user = result[:user]
    end

    super
  end

  private

  def capture_error
    yield
  rescue ExceptionHandler::Unauthorized => e
    @error ||= [403, e.message]
    nil
  rescue ExceptionHandler::MissingToken, ExceptionHandler::InvalidToken => e
    @error ||= [401, e.message]
    nil
  rescue StandardError => _e
    @error ||= [401, 'Request not authenticated']
    nil
  end
end
