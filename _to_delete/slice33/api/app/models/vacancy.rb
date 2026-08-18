# frozen_string_literal: true

class Vacancy < ApplicationRecord
  include TenantScoped

  has_many :vacancy_skills, dependent: :destroy
  has_many :fit_gap_reports, dependent: :destroy

  validates :role_title, presence: true

  accepts_nested_attributes_for :vacancy_skills,
                                 allow_destroy: true,
                                 reject_if: :all_blank

  scope :open,   -> { where('closes_at IS NULL OR closes_at > ?', Time.current) }
  scope :closed, -> { where('closes_at IS NOT NULL AND closes_at <= ?', Time.current) }

  # A closed vacancy stays comparable — existing Fit/Gap reports were written
  # against it and deleting or hiding it would strand them. It is simply
  # labelled, so nobody runs a fresh comparison against a role that is filled.
  def closed?
    closes_at.present? && closes_at <= Time.current
  end
end
