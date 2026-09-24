# frozen_string_literal: true

module Api
  module V1
    class AuthenticationController < ApiController
      skip_before_action :require_tenant!

      # POST /api/v1/auth/login
      def authenticate
        user = User.find_by(email: normalized_email)

        return json_error(INVALID_CREDENTIALS, :unauthorized) unless user&.authenticate(params[:password])

        unless user.staff?
          return json_error(
            'Akun ini belum diberi peran yang bisa mengakses dashboard. Hubungi admin workspace kamu.',
            :forbidden
          )
        end

        render_session_for(user)
      end

      # POST /api/v1/auth/signup
      def signup
        return json_error('Pendaftaran mandiri dimatikan di lingkungan ini.', :forbidden) unless self_signup_allowed?

        bootstrap = !User.exists?
        role      = bootstrap ? 'admin' : requested_role

        return json_error("Peran '#{params[:role]}' tidak dikenal.", :unprocessable_entity) if role.nil?

        user = User.new(email: normalized_email, password: params[:password], role: role)

        return json_error('Pendaftaran gagal.', :unprocessable_entity, details: user.errors.full_messages) unless user.save

        render_session_for(user, :created)
      end

      private

      INVALID_CREDENTIALS = 'Email atau password salah.'

      def normalized_email = params[:email].to_s.downcase.strip

      def requested_role
        wanted = params[:role].to_s.strip
        return User::SELF_ASSIGNABLE_ROLES.first if wanted.empty?

        User::SELF_ASSIGNABLE_ROLES.include?(wanted) ? wanted : nil
      end

      def self_signup_allowed?
        flag = ENV['ALLOW_SELF_SIGNUP']
        return ActiveModel::Type::Boolean.new.cast(flag) if flag.present?

        !Rails.env.production?
      end

      def render_session_for(user, status = :ok)
        scheme = resolve_scheme
        token  = JsonWebToken.encode({ user_id: user.id, role: user.role, scheme: scheme })

        json_response(
          {
            token: token,
            user: {
              id:    user.id,
              email: user.email,
              role:  user.role,
              role_label: user.role_label,
              display_name: user.display_name
            }
          },
          status
        )
      end

      def resolve_scheme
        request.headers['X-Tenant-Scheme'].presence ||
          ActiveRecord::Base.connection.select_value(
            'SELECT scheme FROM organizations LIMIT 1'
          ) || 'test-corp'
      end
    end
  end
end
