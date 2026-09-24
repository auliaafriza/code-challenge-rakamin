# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Session, type: :model do
  describe '.app_base_url' do
    around do |example|
      previous = ENV['APP_BASE_URL']
      example.run
      ENV['APP_BASE_URL'] = previous
    end

    it 'memakai port frontend, bukan port API, saat APP_BASE_URL kosong' do
      ENV.delete('APP_BASE_URL')

      expect(described_class.app_base_url).to eq('http://localhost:5173')
    end

    it 'tidak pernah menunjuk ke port API sebagai default' do
      ENV.delete('APP_BASE_URL')

      expect(described_class.app_base_url).not_to include(':3001')
    end

    it 'membuang slash di ujung supaya tidak menghasilkan //interview' do
      ENV['APP_BASE_URL'] = 'https://hire.example.com///'

      expect(described_class.app_base_url).to eq('https://hire.example.com')
    end

    it 'memakai APP_BASE_URL apa adanya saat sudah diisi' do
      ENV['APP_BASE_URL'] = 'https://hire.example.com'

      expect(described_class.app_base_url).to eq('https://hire.example.com')
    end
  end

  describe '#invite_url' do
    it 'menyusun path /interview/<token> tanpa slash ganda' do
      ENV['APP_BASE_URL'] = 'https://hire.example.com/'
      session = described_class.new(invite_token: 'abc123')

      expect(session.invite_url).to eq('https://hire.example.com/interview/abc123')
    ensure
      ENV.delete('APP_BASE_URL')
    end
  end
end
