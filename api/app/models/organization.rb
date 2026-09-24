# frozen_string_literal: true

class Organization < ApplicationRecord
  self.table_name = 'organizations'

  def self.identify(identifier)
    return default_organization if identifier.blank?

    sql_string = <<~SQL.squish
      (? IN (identifier, name, scheme, host)) OR
      (alias_hosts && ARRAY[?]::varchar[])
    SQL

    where(sql_string, identifier, Array(identifier)).first ||
      default_organization
  end

  def self.default_organization
    where(id: 0).first
  end

  # Convenience: is this the system default org?
  def default?
    id.zero?
  end
end
