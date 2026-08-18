# frozen_string_literal: true

# Builds a complete, deterministic assessment → portfolio → fit/gap chain without
# calling Gemini at all.
#
# Waiting on a live model to reproduce an edge case is slow, costs money, and is
# not reproducible — and the cases that matter most here (a null confidence, a
# level outside the scale, a skill nobody probed) are exactly the ones a healthy
# model will not produce on demand. Every acceptance criterion in the report has
# a row in this seed.
#
#   bundle exec rails demo:seed
#   bundle exec rails demo:reset     # tear down and rebuild
#
namespace :demo do
  SCHEME = ENV.fetch('DEMO_SCHEME', 'test-corp')
  ASSESSMENT_NAME = 'DEMO — Frontend Engineer'
  VACANCY_TITLE   = 'DEMO — Senior Frontend Engineer'

  desc 'Seed a demo portfolio and fit/gap report covering every edge case'
  task seed: :environment do
    org = Organization.find_by(scheme: SCHEME)
    abort "Organization '#{SCHEME}' not found — run `rails db:seed` first." if org.nil?

    RequestStore.store[:organization] = org
    RequestStore.store[:tenant_id]    = org.id

    assessor = find_or_create_assessor!

    puts "== Demo seed (tenant #{org.scheme}, id=#{org.id}) =="

    assessment = Assessment.find_or_create_by!(name: ASSESSMENT_NAME) do |a|
      a.tenant_id      = org.id
      a.created_by     = assessor.id
      a.time_limit_min = 45
      a.language       = 'id'
    end

    session = Session.find_or_create_by!(assessment: assessment, candidate_name: 'Kandidat Demo') do |s|
      s.tenant_id  = org.id
      s.status     = 'ended'
      s.end_reason = 'all_covered'
      s.started_at = 90.minutes.ago
      s.ended_at   = 45.minutes.ago
      s.duration_seconds = 45 * 60
    end

    turns = seed_transcript!(session)
    seed_coverage!(session)

    portfolio = Portfolio.find_or_create_by!(session: session) do |p|
      p.generation_status = 'complete'
    end
    portfolio.update!(
      generation_status:     'complete',
      generated_at:          Time.current,
      generation_started_at: 2.minutes.ago,
      generation_error:      nil
    )

    seed_portfolio_skills!(portfolio, turns)
    seed_override!(portfolio, assessor)

    vacancy = seed_vacancy!(org, assessor)
    report  = build_fit_gap!(portfolio, vacancy)

    puts ''
    puts '== Done =='
    puts "  Assessment : #{assessment.id} — #{assessment.name}"
    puts "  Session    : #{session.id}"
    puts "  Portfolio  : #{portfolio.id} (#{portfolio.portfolio_skills.count} skills)"
    puts "  Vacancy    : #{vacancy.id} — #{vacancy.role_title}"
    puts "  Fit/Gap    : #{report.id} (#{report.skill_comparisons.size} comparisons)"
    puts ''
    puts '  Buka di browser:'
    puts "    /assessments/#{assessment.id}/sessions/#{session.id}/portfolio"
    puts "    /assessments/#{assessment.id}/sessions/#{session.id}/fitgap/#{vacancy.id}"
    puts ''
    puts '  Edge case yang sengaja ditanam:'
    puts '    · keyakinan NULL           → harus tampil "Belum terukur", bukan LOW merah'
    puts '    · gap dengan 1 probe       → harus memunculkan peringatan bukti tipis'
    puts '    · override assessor L2→L4  → harus tampil AI L2 → L4 beserta email & waktu'
    puts '    · skill tak pernah diprobe → harus "Belum dinilai", bukan L1'
    puts '    · ringkasan 2.000 karakter → layout kartu harus tetap utuh'
    puts '    · label tanpa spasi        → tabel tidak boleh melebar'
  ensure
    RequestStore.clear!
  end

  desc 'Remove everything demo:seed created'
  task reset: :environment do
    org = Organization.find_by(scheme: SCHEME)
    abort "Organization '#{SCHEME}' not found." if org.nil?

    RequestStore.store[:organization] = org
    RequestStore.store[:tenant_id]    = org.id

    Assessment.where(name: ASSESSMENT_NAME).find_each do |assessment|
      assessment.sessions.find_each(&:destroy)
      assessment.destroy
    end
    Vacancy.where(role_title: VACANCY_TITLE).find_each(&:destroy)

    puts 'Demo data removed.'
  ensure
    RequestStore.clear!
  end

  # ── helpers ────────────────────────────────────────────────────────────────

  def find_or_create_assessor!
    User.find_by(email: 'assessor@rakamin.test') ||
      User.create!(email: 'assessor@rakamin.test', password: 'password123', role: 'admin')
  end

  DIALOGUE = [
    ['ai', 'Ceritakan bagaimana kamu memutuskan struktur komponen di proyek terakhirmu.'],
    ['candidate', 'Saya biasanya mulai dari data yang dibutuhkan layar itu, baru menurunkan komponennya. Kalau state-nya dipakai lebih dari dua tempat, saya angkat ke atas daripada mengoper props berlapis.'],
    ['ai', 'Pernah keputusan itu salah?'],
    ['candidate', 'Pernah. Saya sempat mengangkat state terlalu awal dan seluruh halaman ikut re-render. Sekarang saya ukur dulu dengan profiler sebelum memindahkan apa pun.'],
    ['ai', 'Bagaimana kamu menangani error dari API di frontend?'],
    ['candidate', 'Saya pisahkan error yang bisa ditindaklanjuti pengguna dari yang tidak. Yang tidak bisa, saya log dan tampilkan pesan netral supaya tidak membocorkan detail internal.'],
    ['ai', 'Bagaimana pendekatanmu ke testing?'],
    ['candidate', 'Saya menulis test untuk perilaku yang kalau rusak akan merugikan pengguna, bukan untuk mengejar angka coverage.'],
    ['ai', 'Bagaimana kamu memastikan antarmuka bisa dipakai screen reader?'],
    ['candidate', 'Terus terang ini bagian yang paling jarang saya sentuh. Biasanya saya ikut pola dari design system dan belum pernah mengujinya sendiri.']
  ].freeze

  def seed_transcript!(session)
    return session.transcript_turns.ordered.to_a if session.transcript_turns.exists?

    DIALOGUE.each_with_index do |(speaker, text), i|
      TranscriptTurn.create!(
        session:        session,
        turn_number:    i + 1,
        speaker:        speaker,
        text:           text,
        audio_start_ms: i * 30_000,
        audio_end_ms:   (i + 1) * 30_000
      )
    end

    session.transcript_turns.ordered.to_a
  end

  COVERAGE = [
    ['React / Frontend Development', 'covered',   4, false],
    ['Testing & Quality Assurance',  'partial',   2, false],
    ['Security Engineering',         'initiated', 1, false],
    ['Accessibility Engineering',    'initiated', 1, true]
  ].freeze

  def seed_coverage!(session)
    COVERAGE.each do |label, state, probes, discovered|
      map = CoverageMap.find_or_initialize_by(session: session, skill_label: label)
      map.update!(state: state, probe_count: probes, is_discovered: discovered)
    end
  end

  LONG_SUMMARY = ('Kandidat konsisten menurunkan struktur komponen dari kebutuhan data layar, ' \
                  'bukan dari kebiasaan folder. Ia bisa menjelaskan trade-off antara mengangkat ' \
                  'state dan mengoper props, dan sudah pernah salah lalu memperbaikinya dengan ' \
                  'pengukuran, bukan dengan tebakan. ') * 6

  def seed_portfolio_skills!(portfolio, turns)
    portfolio.portfolio_skills.destroy_all
    quote_turn = ->(fragment) { turns.find { |t| t.text.include?(fragment) }&.id }

    # 1 — happy path: deep coverage, high confidence, traceable evidence
    portfolio.portfolio_skills.create!(
      skill_label:        'React / Frontend Development',
      is_discovered:      false,
      ai_level:           4,
      ai_confidence:      'high',
      evidence: [
        'Saya biasanya mulai dari data yang dibutuhkan layar itu, baru menurunkan komponennya.',
        'Sekarang saya ukur dulu dengan profiler sebelum memindahkan apa pun.'
      ],
      evidence_turn_ids:  [quote_turn.call('mulai dari data'), quote_turn.call('profiler')].compact,
      # Long text: the card must clamp rather than blow up its layout.
      competency_summary: LONG_SUMMARY
    )

    # 2 — the override case: model said L2, an assessor disagreed
    portfolio.portfolio_skills.create!(
      skill_label:        'Testing & Quality Assurance',
      is_discovered:      false,
      ai_level:           2,
      ai_confidence:      'medium',
      evidence:           ['Saya menulis test untuk perilaku yang kalau rusak akan merugikan pengguna.'],
      evidence_turn_ids:  [quote_turn.call('merugikan pengguna')].compact,
      competency_summary: 'Menulis test berdasarkan risiko, bukan target coverage. Belum terlihat menyentuh test integrasi.'
    )

    # 3 — a gap standing on a single probe: the report must flag it as provisional
    portfolio.portfolio_skills.create!(
      skill_label:        'Security Engineering',
      is_discovered:      false,
      ai_level:           2,
      ai_confidence:      'low',
      evidence:           ['Saya pisahkan error yang bisa ditindaklanjuti pengguna dari yang tidak.'],
      evidence_turn_ids:  [quote_turn.call('ditindaklanjuti')].compact,
      competency_summary: 'Baru satu probe. Menyebut pemisahan pesan error, tapi belum terlihat pemodelan ancaman.'
    )

    # 4 — confidence genuinely unreported: must read "unmeasured", never "low"
    portfolio.portfolio_skills.create!(
      skill_label:        'Accessibility Engineering',
      is_discovered:      true,
      ai_level:           2,
      ai_confidence:      nil,
      evidence:           ['Terus terang ini bagian yang paling jarang saya sentuh.'],
      evidence_turn_ids:  [quote_turn.call('paling jarang saya sentuh')].compact,
      competency_summary: 'Jujur soal keterbatasannya. Mengikuti pola design system tanpa pengujian mandiri.'
    )

    # 5 — a label with no spaces at all: the table must wrap, not stretch
    portfolio.portfolio_skills.create!(
      skill_label:        'Micro-frontend-module-federation-and-runtime-composition',
      is_discovered:      true,
      ai_level:           2,
      ai_confidence:      'low',
      evidence:           [],
      evidence_turn_ids:  [],
      competency_summary: 'Disinggung sekilas tanpa pendalaman.'
    )
  end

  def seed_override!(portfolio, assessor)
    skill = portfolio.portfolio_skills.find_by(skill_label: 'Testing & Quality Assurance')
    return if skill.nil?

    override = AssessorOverride.find_or_initialize_by(portfolio_skill_id: skill.id)
    override.update!(
      ai_level:       skill.ai_level,
      override_level: 4,
      assessor_notes: 'Contoh test yang dia berikan di menit 22 jelas di atas L2 — dia menjelaskan ' \
                      'kenapa sebuah test layak ada, bukan sekadar cara menulisnya.',
      overridden_by:  assessor.id,
      overridden_at:  Time.current
    )
  end

  VACANCY_SKILLS = [
    ['React / Frontend Development', 4],
    ['Testing & Quality Assurance',  4],
    ['Security Engineering',         4],
    ['DevOps & CI/CD',               3] # deliberately never probed
  ].freeze

  def seed_vacancy!(org, assessor)
    vacancy = Vacancy.find_or_create_by!(role_title: VACANCY_TITLE) do |v|
      v.tenant_id  = org.id
      v.created_by = assessor.id
      v.culture_dimensions      = 'Ownership tinggi, komunikasi tertulis yang jelas, nyaman dengan ambiguitas.'
      v.competency_expectations = 'Mampu memimpin keputusan arsitektur frontend dan menaikkan standar tim.'
    end

    VACANCY_SKILLS.each do |label, level|
      skill = VacancySkill.find_or_initialize_by(vacancy: vacancy, skill_label: label)
      skill.update!(expected_level: level)
    end

    vacancy
  end

  # A stub standing in for Gemini: deterministic, free, and offline. The skill
  # comparison itself is rule-based, so this exercises the real engine path.
  class StubNarrator
    def generate_content(_prompt, **_opts)
      {
        'culture_narrative' => 'Kandidat menunjukkan ownership yang jelas dan mau mengoreksi diri ' \
                               'berdasarkan pengukuran. Beberapa temuan masih berdiri di atas bukti ' \
                               'tipis dan belum layak jadi dasar keputusan akhir.',
        'overall_narrative' => 'Layak dilanjutkan ke tahap berikutnya, dengan satu sesi khusus untuk ' \
                               'mendalami security engineering sebelum keputusan diambil.'
      }
    end
  end

  def build_fit_gap!(portfolio, vacancy)
    FitGapReport.find_by(portfolio_id: portfolio.id, vacancy_id: vacancy.id)&.destroy
    FitGap::Engine.new(portfolio: portfolio, vacancy: vacancy, gemini_client: StubNarrator.new).call
  end
end
