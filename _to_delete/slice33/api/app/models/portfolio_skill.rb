# frozen_string_literal: true

class PortfolioSkill < ApplicationRecord
  CONFIDENCE_LEVELS = %w[high medium low].freeze

  belongs_to :portfolio
  has_one :assessor_override, dependent: :destroy

  validates :skill_label, presence: true
  validates :ai_level, numericality: { only_integer: true, in: 1..5 }
  # nil is the explicit "not measured" state. Rejecting it would force every
  # unreadable model answer to be coerced into `low` — a negative claim about a
  # person, manufactured out of a gap in our own data.
  validates :ai_confidence, inclusion: { in: CONFIDENCE_LEVELS }, allow_nil: true
  validates :competency_summary, presence: true

  # evidence is stored as JSONB array of quote strings
  def evidence_quotes
    Array(evidence)
  end

  # transcript_turn ids backing each quote, positionally aligned with `evidence`
  def evidence_turn_id_list
    Array(try(:evidence_turn_ids))
  end

  def confidence_measured?
    ai_confidence.present?
  end
end
