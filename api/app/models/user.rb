# frozen_string_literal: true

class User < ApplicationRecord
  has_secure_password

  STAFF_ROLES = %w[admin assessor recruiter hiring_manager].freeze

  ROLES = (STAFF_ROLES + %w[user]).freeze

  SELF_ASSIGNABLE_ROLES = (STAFF_ROLES - %w[admin]).freeze

  ROLE_LABELS = {
    'admin'          => 'Admin',
    'assessor'       => 'Assessor',
    'recruiter'      => 'Recruiter',
    'hiring_manager' => 'Hiring Manager',
    'user'           => 'Belum diberi peran'
  }.freeze

  validates :email, presence: true,
                    uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :role, inclusion: { in: ROLES }
  validates :password, length: { minimum: 8 }, if: -> { password.present? }

  before_save :downcase_email

  def staff? = STAFF_ROLES.include?(role)

  def role_label = ROLE_LABELS.fetch(role, role)

  def display_name = email.to_s.split('@').first.to_s.tr('._-', ' ').split.map(&:capitalize).join(' ')

  private

  def downcase_email
    self.email = email.downcase
  end
end
