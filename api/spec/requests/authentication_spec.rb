# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Authentication', type: :request do
  before do
    ENV['ALLOW_SELF_SIGNUP'] = 'true'
    User.create!(email: 'owner@rakamin.test', password: 'password123', role: 'admin')
  end

  after { ENV.delete('ALLOW_SELF_SIGNUP') }

  describe 'POST /api/v1/auth/signup' do
    it 'membuat akun dengan peran kerja yang diminta' do
      post '/api/v1/auth/signup',
           params: { email: 'rina@rakamin.test', password: 'password123', role: 'recruiter' }

      expect(response).to have_http_status(:created)
      expect(json.dig('user', 'role')).to eq('recruiter')
      expect(json['token']).to be_present
    end

    it 'menolak permintaan role admin dari formulir publik' do
      post '/api/v1/auth/signup',
           params: { email: 'penyusup@rakamin.test', password: 'password123', role: 'admin' }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(User.find_by(email: 'penyusup@rakamin.test')).to be_nil
    end

    it 'menolak role yang tidak dikenal alih-alih diam-diam memakai default' do
      post '/api/v1/auth/signup',
           params: { email: 'x@rakamin.test', password: 'password123', role: 'superuser' }

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it 'menolak password pendek dan menyebutkan alasannya' do
      post '/api/v1/auth/signup',
           params: { email: 'y@rakamin.test', password: 'short', role: 'recruiter' }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.body).to include('Password')
    end

    it 'mati di production kecuali dinyalakan secara eksplisit' do
      ENV.delete('ALLOW_SELF_SIGNUP')
      allow(Rails).to receive(:env).and_return(ActiveSupport::StringInquirer.new('production'))

      post '/api/v1/auth/signup',
           params: { email: 'z@rakamin.test', password: 'password123', role: 'recruiter' }

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe 'POST /api/v1/auth/login' do
    it 'menerima peran kerja selain admin' do
      User.create!(email: 'hm@rakamin.test', password: 'password123', role: 'hiring_manager')

      post '/api/v1/auth/login', params: { email: 'hm@rakamin.test', password: 'password123' }

      expect(response).to have_http_status(:ok)
      expect(json.dig('user', 'role')).to eq('hiring_manager')
    end

    it 'menolak akun tanpa peran kerja dengan alasan yang benar, bukan "password salah"' do
      User.create!(email: 'belum@rakamin.test', password: 'password123', role: 'user')

      post '/api/v1/auth/login', params: { email: 'belum@rakamin.test', password: 'password123' }

      expect(response).to have_http_status(:forbidden)
      expect(response.body).to include('belum diberi peran')
    end

    it 'tidak membedakan email tidak terdaftar dari password salah' do
      post '/api/v1/auth/login', params: { email: 'hantu@rakamin.test', password: 'password123' }
      tidak_terdaftar = response.body

      post '/api/v1/auth/login', params: { email: 'owner@rakamin.test', password: 'salahsekali' }

      expect(response.body).to eq(tidak_terdaftar)
      expect(response).to have_http_status(:unauthorized)
    end
  end

  def json = JSON.parse(response.body)
end
