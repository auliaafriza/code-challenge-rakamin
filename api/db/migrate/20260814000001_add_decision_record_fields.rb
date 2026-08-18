# frozen_string_literal: true

# Adds the columns needed to make a rating explainable after the fact.
#
# All three are additive, nullable-or-defaulted, and safe against existing rows:
# no backfill is required, no existing column changes type, and `down` drops
# exactly what `up` added. Running this on a populated database leaves every
# existing row valid and readable by the previous code.
class AddDecisionRecordFields < ActiveRecord::Migration[7.0]
  def up
    # When generation began. Without it there is no way to tell "still working"
    # from "stuck", which is why a portfolio parked in `pending` could spin
    # forever with no recovery path inside the product.
    unless column_exists?(:portfolios, :generation_started_at)
      add_column :portfolios, :generation_started_at, :datetime
    end

    # Which transcript turns an evidence quote came from, so a reviewer can jump
    # to the moment it was said instead of re-reading the whole interview.
    unless column_exists?(:portfolio_skills, :evidence_turn_ids)
      add_column :portfolio_skills, :evidence_turn_ids, :jsonb, default: [], null: false
    end

    # Whether the narrative came from the deterministic fallback rather than the
    # model, so the UI can label it instead of passing arithmetic off as analysis.
    unless column_exists?(:fit_gap_reports, :narrative_is_fallback)
      add_column :fit_gap_reports, :narrative_is_fallback, :boolean, default: false, null: false
    end

    # "We never measured this" needs a representation. Without one, an unreadable
    # value from the model had to be coerced into one of high/medium/low, and the
    # honest choice — low — reads to a hiring manager as a finding about the
    # candidate rather than a gap in our own data.
    change_column_null :portfolio_skills, :ai_confidence, true

    # Backfill only for rows already finished — leaves in-flight rows untouched.
    execute <<~SQL.squish
      UPDATE portfolios
         SET generation_started_at = generated_at
       WHERE generation_started_at IS NULL
         AND generated_at IS NOT NULL
    SQL
  end

  def down
    # Restore NOT NULL safely: anything recorded as "unmeasured" becomes 'low',
    # which is what the old code would have shown for it anyway.
    execute "UPDATE portfolio_skills SET ai_confidence = 'low' WHERE ai_confidence IS NULL"
    change_column_null :portfolio_skills, :ai_confidence, false

    remove_column :fit_gap_reports, :narrative_is_fallback if column_exists?(:fit_gap_reports, :narrative_is_fallback)
    remove_column :portfolio_skills, :evidence_turn_ids if column_exists?(:portfolio_skills, :evidence_turn_ids)
    remove_column :portfolios, :generation_started_at if column_exists?(:portfolios, :generation_started_at)
  end
end
