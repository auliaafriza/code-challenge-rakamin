# frozen_string_literal: true

# Assessments and vacancies had no notion of an end date.
#
# An invite link, once generated, stayed valid forever: an assessor could close
# a role in March and a candidate could still walk into the AI interview in
# November, be recorded, be graded, and have a portfolio written about them for
# a job that no longer exists. The product had no way to express "this process
# is over", so it never was.
#
# That is also a data-protection problem rather than only a UX one. UU PDP asks
# a controller to state how long personal data is retained and for what purpose;
# a hiring process with no defined end has no answer to either.
#
# Both columns are nullable, so every existing row keeps its current behaviour
# (no expiry) until someone sets a date. `down` drops exactly what `up` added.
class AddExpiryDatesAndSessionNaming < ActiveRecord::Migration[7.0]
  def up
    add_column :assessments, :expires_at, :datetime unless column_exists?(:assessments, :expires_at)
    add_column :vacancies,   :closes_at,  :datetime unless column_exists?(:vacancies, :closes_at)

    # Assessors filter by "what is still open", which is a range scan.
    add_index :assessments, :expires_at unless index_exists?(:assessments, :expires_at)
    add_index :vacancies,   :closes_at  unless index_exists?(:vacancies, :closes_at)
  end

  def down
    remove_index :vacancies,   :closes_at  if index_exists?(:vacancies, :closes_at)
    remove_index :assessments, :expires_at if index_exists?(:assessments, :expires_at)
    remove_column :vacancies,   :closes_at  if column_exists?(:vacancies, :closes_at)
    remove_column :assessments, :expires_at if column_exists?(:assessments, :expires_at)
  end
end
