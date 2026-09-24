# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'GET /api/v1/sessions', type: :request do
  def seed_org!(scheme, name)
    ActiveRecord::Base.connection.execute(<<~SQL.squish)
      INSERT INTO public.organizations (name, scheme, identifier, host, alias_hosts, config, created_at, updated_at)
      VALUES ('#{name}', '#{scheme}', '#{scheme}', 'localhost', '{}', '{}', now(), now())
      ON CONFLICT DO NOTHING
    SQL
    Organization.find_by(scheme: scheme)
  end

  let!(:org)   { seed_org!('tenant-a', 'Tenant A') }
  let!(:other) { seed_org!('tenant-b', 'Tenant B') }
  let(:headers) { auth_headers(user_id: 1, role: 'admin', scheme: 'tenant-a') }

  def assessment_for(organization, name)
    with_tenant(organization) do
      Assessment.create!(
        tenant_id: organization.id, created_by: 1, name: name,
        time_limit_min: 30, language: 'id'
      )
    end
  end

  def session_for(organization, assessment, **attrs)
    with_tenant(organization) do
      Session.create!({ tenant_id: organization.id, assessment: assessment }.merge(attrs))
    end
  end

  let!(:frontend) { assessment_for(org, 'Frontend role') }
  let!(:backend)  { assessment_for(org, 'Backend role') }

  before do
    session_for(org, frontend, candidate_name: 'Rina Hartono', status: 'ended', end_reason: 'all_covered')
    session_for(org, frontend, candidate_name: 'Bayu Prakoso', status: 'active')
    session_for(org, backend,  candidate_name: 'Sari Wulandari', status: 'pending')
  end

  def json = JSON.parse(response.body)

  it 'mengembalikan meta paginasi yang lengkap' do
    get '/api/v1/sessions', headers: headers

    expect(response).to have_http_status(:ok)
    expect(json['meta'].keys).to match_array(%w[current_page total_pages total_count per_page])
    expect(json['meta']['total_count']).to eq(3)
  end

  it 'menyertakan assessment di tiap baris supaya daftar tidak perlu menembak per baris' do
    get '/api/v1/sessions', headers: headers

    expect(json['sessions'].first['assessment']).to include('id', 'name', 'time_limit_min')
  end

  it 'menyaring berdasarkan assessment' do
    get '/api/v1/sessions', params: { assessment_id: backend.id }, headers: headers

    expect(json['sessions'].map { |s| s['candidate_name'] }).to eq(['Sari Wulandari'])
  end

  it 'menyaring berdasarkan status' do
    get '/api/v1/sessions', params: { status: 'active' }, headers: headers

    expect(json['sessions'].map { |s| s['candidate_name'] }).to eq(['Bayu Prakoso'])
  end

  it 'mengabaikan status yang tidak dikenal alih-alih mengembalikan daftar kosong' do
    get '/api/v1/sessions', params: { status: 'bukan-status' }, headers: headers

    expect(json['sessions'].size).to eq(3)
  end

  it 'mencari berdasarkan nama tanpa memperhatikan huruf besar-kecil' do
    get '/api/v1/sessions', params: { q: 'rina' }, headers: headers

    expect(json['sessions'].map { |s| s['candidate_name'] }).to eq(['Rina Hartono'])
  end

  it 'memperlakukan % sebagai huruf biasa, bukan wildcard' do
    get '/api/v1/sessions', params: { q: '%' }, headers: headers

    expect(json['sessions']).to be_empty
  end

  it 'tidak pernah menampilkan sesi tenant lain' do
    other_assessment = assessment_for(other, 'Tenant B role')
    session_for(other, other_assessment, candidate_name: 'Orang Lain', status: 'pending')

    get '/api/v1/sessions', headers: headers

    expect(json['sessions'].map { |s| s['candidate_name'] }).not_to include('Orang Lain')
    expect(json['meta']['total_count']).to eq(3)
  end

  it 'menghormati per_page' do
    get '/api/v1/sessions', params: { per_page: 2 }, headers: headers

    expect(json['sessions'].size).to eq(2)
    expect(json['meta']['total_pages']).to eq(2)
  end
end
