# frozen_string_literal: true

# APP_BASE_URL must point at the React app, not at this API.
#
# Getting it wrong raises nothing. Invite links are still built, still copied,
# still sent — and only fail in the candidate's browser, the one person in the
# chain with no way to report it. So the check happens at boot, while whoever
# set it is still looking at a screen.
Rails.application.config.after_initialize do
  base = ENV['APP_BASE_URL'].presence || 'http://localhost:5173'
  api_port = ENV.fetch('PORT', 3001).to_s
  allowed = ENV.fetch('ALLOWED_ORIGINS', '').split(',').map(&:strip).reject(&:empty?)

  uri = begin
    URI.parse(base)
  rescue URI::InvalidURIError
    nil
  end

  origin = uri && uri.host ? "#{uri.scheme}://#{uri.host}#{":#{uri.port}" unless uri.default_port == uri.port}" : nil

  message =
    if uri.nil? || uri.host.nil?
      "APP_BASE_URL (#{base.inspect}) bukan URL yang sah."
    elsif uri.port.to_s == api_port && %w[localhost 127.0.0.1].include?(uri.host)
      "APP_BASE_URL menunjuk ke port API ini sendiri (#{api_port}). " \
      'Rails tidak punya route /interview, jadi setiap link undangan akan 404 ' \
      'di tangan kandidat. Isi dengan URL frontend, mis. http://localhost:5173.'
    elsif allowed.any? && allowed.none? { |o| o.casecmp?(origin.to_s) }
      # Origin frontend adalah yang diizinkan CORS. Kalau APP_BASE_URL tidak ada
      # di daftar itu, hampir pasti ia menunjuk ke domain API — kesalahan yang
      # sama seperti localhost:3001, hanya dengan nama domain sungguhan.
      "APP_BASE_URL (#{origin}) tidak ada di ALLOWED_ORIGINS (#{allowed.join(', ')}). " \
      'Link undangan harus memakai domain frontend, bukan domain API.'
    end

  next if message.nil?

  Rails.logger.warn("[APP_BASE_URL] #{message}")
  warn("\n  ⚠  [APP_BASE_URL] #{message}\n\n") unless Rails.env.test?
end
