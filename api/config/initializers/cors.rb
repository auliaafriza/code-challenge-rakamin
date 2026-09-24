# frozen_string_literal: true

# Vite falls back to the next free port when 5173 is taken, so a hard-coded
# origin list turns a busy port into a request that fails with no status and no
# message in the browser. Locally, any localhost port is accepted.
allowed = ENV.fetch('ALLOWED_ORIGINS', '').split(',').map(&:strip).reject(&:empty?)
local = %r{\Ahttp://(localhost|127\.0\.0\.1)(:\d+)?\z}
permissive = Rails.env.development? || Rails.env.test?

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    if permissive
      origins { |source, _env| allowed.include?(source) || source.to_s.match?(local) }
    else
      origins(*allowed)
    end

    resource '*',
             headers: :any,
             methods: %i[get post put patch delete options head],
             expose: ['Authorization'],
             credentials: false
  end
end
