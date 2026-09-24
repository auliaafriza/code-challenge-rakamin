# frozen_string_literal: true

module Api
  module V1
    class UsersController < ApiController
      authorize_auth_token! :assessor

      # GET /api/v1/users
      def index
        users = User.where(role: User::STAFF_ROLES).order(:email)

        json_response(users: users.map { |u| user_json(u) })
      end

      private

      def user_json(user)
        base = { id: user.id, display_name: user.display_name, role: user.role, role_label: user.role_label }
        return base unless current_user&.role == 'admin'

        base.merge(email: user.email)
      end
    end
  end
end
